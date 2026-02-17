import { eq, sql } from "drizzle-orm";
import { getDb } from "./db/index.js";
import { reviewJobs } from "./db/schema.js";
import { logger } from "./logger.js";

export interface JobData {
  id?: number;
  installationId: number;
  owner: string;
  repo: string;
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  commitSha: string;
  baseBranch: string;
}

export type JobHandler = (data: JobData) => Promise<void>;

export class PersistentQueue {
  private handler: JobHandler;
  private concurrency: number;
  private running = 0;
  private runningPerInstallation = new Map<number, number>();
  private maxPerInstallation = 1;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private shuttingDown = false;

  constructor(handler: JobHandler, concurrency = 3) {
    this.handler = handler;
    this.concurrency = concurrency;
  }

  async enqueue(data: JobData): Promise<number> {
    const db = getDb();
    const [job] = await db
      .insert(reviewJobs)
      .values({
        installationId: data.installationId,
        owner: data.owner,
        repo: data.repo,
        repoFullName: data.repoFullName,
        prNumber: data.prNumber,
        prTitle: data.prTitle,
        commitSha: data.commitSha,
        baseBranch: data.baseBranch,
        status: "pending",
      })
      .returning();

    return job.id;
  }

  start(): void {
    this.pollInterval = setInterval(() => this.poll(), 1000);
  }

  stop(): void {
    this.shuttingDown = true;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async waitForCompletion(): Promise<void> {
    while (this.running > 0) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private async poll(): Promise<void> {
    if (this.shuttingDown) return;
    if (this.running >= this.concurrency) return;

    const db = getDb();

    const runningInstallations = Array.from(this.runningPerInstallation.entries())
      .filter(([, count]) => count >= this.maxPerInstallation)
      .map(([id]) => id);

    const excludeClause = runningInstallations.length > 0
      ? sql`AND installation_id NOT IN (${sql.join(
          runningInstallations.map((id) => sql`${id}`),
          sql`, `
        )})`
      : sql``;

    const result = await db.execute(sql`
      UPDATE review_jobs
      SET status = 'processing', started_at = NOW()
      WHERE id = (
        SELECT id FROM review_jobs
        WHERE status = 'pending' AND attempts < max_attempts
        ${excludeClause}
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `);

    const jobId = (result[0] as { id: number } | undefined)?.id;
    if (jobId == null) return;

    const [typedJob] = await db.select().from(reviewJobs).where(eq(reviewJobs.id, jobId));
    if (!typedJob) return;

    this.running++;
    this.runningPerInstallation.set(
      typedJob.installationId,
      (this.runningPerInstallation.get(typedJob.installationId) ?? 0) + 1
    );

    this.processJob(typedJob).finally(() => {
      this.running--;
      const current = this.runningPerInstallation.get(typedJob.installationId) ?? 1;
      if (current <= 1) {
        this.runningPerInstallation.delete(typedJob.installationId);
      } else {
        this.runningPerInstallation.set(typedJob.installationId, current - 1);
      }
    });
  }

  private async processJob(job: typeof reviewJobs.$inferSelect): Promise<void> {
    const db = getDb();

    try {
      await this.handler({
        id: job.id,
        installationId: job.installationId,
        owner: job.owner,
        repo: job.repo,
        repoFullName: job.repoFullName,
        prNumber: job.prNumber,
        prTitle: job.prTitle,
        commitSha: job.commitSha,
        baseBranch: job.baseBranch,
      });

      await db
        .update(reviewJobs)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(reviewJobs.id, job.id));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      const attempts = job.attempts + 1;
      const status = attempts >= job.maxAttempts ? "failed" : "pending";

      await db
        .update(reviewJobs)
        .set({
          status,
          attempts,
          errorMessage,
          startedAt: null,
        })
        .where(eq(reviewJobs.id, job.id));

      logger.error("Job processing failed", {
        jobId: job.id,
        repo: job.repoFullName,
        pr: job.prNumber,
        attempts,
        error: errorMessage,
      });
    }
  }

  async recoverStaleJobs(): Promise<void> {
    const db = getDb();

    const result = await db
      .update(reviewJobs)
      .set({ status: "pending", startedAt: null })
      .where(eq(reviewJobs.status, "processing"))
      .returning();

    if (result.length > 0) {
      logger.info("Recovered stale jobs", { count: result.length });
    }
  }

  async getQueueStats(): Promise<{ pending: number; processing: number; failed: number }> {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT status, COUNT(*) as count
      FROM review_jobs
      GROUP BY status
    `);

    const stats = { pending: 0, processing: 0, failed: 0 };
    for (const row of result) {
      const row_ = row as { status: string; count: string };
      if (row_.status === "pending") stats.pending = parseInt(row_.count);
      if (row_.status === "processing") stats.processing = parseInt(row_.count);
      if (row_.status === "failed") stats.failed = parseInt(row_.count);
    }
    return stats;
  }

  get active(): number {
    return this.running;
  }
}

export class AsyncQueue<T> {
  private queue: { data: T; resolve: (value: void) => void; reject: (error: Error) => void }[] = [];
  private running = 0;
  private concurrency: number;
  private handler: (data: T) => Promise<void>;

  constructor(handler: (data: T) => Promise<void>, concurrency = 3) {
    this.handler = handler;
    this.concurrency = concurrency;
  }

  enqueue(data: T): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ data, resolve, reject });
      this.process();
    });
  }

  private async process() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.running++;
      try {
        await this.handler(job.data);
        job.resolve();
      } catch (err) {
        job.reject(err instanceof Error ? err : new Error(String(err)));
      } finally {
        this.running--;
        this.process();
      }
    }
  }

  get pending() {
    return this.queue.length;
  }

  get active() {
    return this.running;
  }
}
