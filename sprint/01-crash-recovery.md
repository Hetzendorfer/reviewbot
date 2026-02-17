# Iteration 1: Crash Recovery Foundation

**Goal:** Ensure reviews survive container restarts and crashes.

**Estimated Time:** 3-4 hours

**Priority:** Critical - without this, any restart loses in-flight reviews.

---

## Tasks

### 1.1 Add Database Schema for Persistent Jobs

**File:** `src/db/schema.ts`

Add after the `reviews` table definition:

```typescript
export const reviewJobs = pgTable("review_jobs", {
  id: serial("id").primaryKey(),
  installationId: integer("installation_id").notNull(),
  repoFullName: text("repo_full_name").notNull(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  prNumber: integer("pr_number").notNull(),
  prTitle: text("pr_title").notNull(),
  commitSha: text("commit_sha").notNull(),
  baseBranch: text("base_branch").notNull(),
  status: reviewStatusEnum("status").default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(3).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

// Add index for efficient querying
// Run manually: CREATE INDEX idx_review_jobs_status ON review_jobs(status);
// Run manually: CREATE INDEX idx_review_jobs_created ON review_jobs(created_at);
```

**Command:**
```bash
bun run db:generate
bun run db:migrate
```

---

### 1.2 Create Database-Backed Job Queue

**File:** `src/queue.ts` (rewrite entirely)

```typescript
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "./db/index.js";
import { reviewJobs } from "./db/schema.js";

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
    
    // Claim exactly one job atomically using FOR UPDATE SKIP LOCKED
    // This prevents race conditions where multiple pollers grab the same job
    const result = await db.execute(sql`
      UPDATE review_jobs
      SET status = 'processing', started_at = NOW()
      WHERE id = (
        SELECT id FROM review_jobs
        WHERE status = 'pending' AND attempts < max_attempts
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);

    const job = result.rows[0];
    if (!job) return;

    this.running++;
    this.processJob(job as typeof reviewJobs.$inferSelect).finally(() => {
      this.running--;
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
    }
  }

  async recoverStaleJobs(): Promise<void> {
    const db = getDb();
    
    // Reset jobs that were "processing" when we crashed
    await db
      .update(reviewJobs)
      .set({ status: "pending", startedAt: null })
      .where(eq(reviewJobs.status, "processing"));
  }

  async getQueueStats(): Promise<{ pending: number; processing: number; failed: number }> {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT status, COUNT(*) as count
      FROM review_jobs
      GROUP BY status
    `);
    
    const stats = { pending: 0, processing: 0, failed: 0 };
    for (const row of result.rows) {
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
```

---

### 1.3 Update Pipeline to Use Persistent Queue

**File:** `src/review/pipeline.ts`

Change line 1-12 imports:
```typescript
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { installations, installationSettings, reviews } from "../db/schema.js";
import { getOctokit, fetchPRDiff } from "../github/client.js";
import { getProvider } from "../llm/registry.js";
import { decrypt } from "../crypto.js";
import { loadConfig } from "../config.js";
import { parseDiff, filterFiles, chunkDiffs } from "./differ.js";
import { postReviewToGitHub } from "./poster.js";
import { fetchRepoConfig, mergeConfig } from "../repo-config.js";
import { PersistentQueue, type JobData } from "../queue.js";
import type { ReviewResult } from "../llm/types.js";
```

Change line 25:
```typescript
// Remove: const reviewQueue = new AsyncQueue<ReviewJob>(processReview, 3);
// Add:
let reviewQueue: PersistentQueue | null = null;

export function startQueue(): void {
  reviewQueue = new PersistentQueue(processReview, 3);
  reviewQueue.recoverStaleJobs().then(() => {
    reviewQueue!.start();
  });
}

export function stopQueue(): Promise<void> {
  if (!reviewQueue) return Promise.resolve();
  reviewQueue.stop();
  return reviewQueue.waitForCompletion();
}
```

Change `enqueueReview` function:
```typescript
export function enqueueReview(job: JobData): void {
  if (!reviewQueue) {
    console.error("Queue not started");
    return;
  }
  reviewQueue.enqueue(job).catch((err) => {
    console.error(`Failed to enqueue review:`, err);
  });
}
```

---

### 1.4 Add Graceful Shutdown to Server

**File:** `src/index.ts`

Add after imports, before `const app = ...`:
```typescript
import { startQueue, stopQueue } from "./review/pipeline.js";

// Start the queue
startQueue();

// Graceful shutdown
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  // Stop accepting new requests
  app.stop();
  
  // Wait for queue to finish
  await stopQueue();
  
  console.log("Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

---

### 1.5 Remove Token Cache (Required)

**File:** `src/github/auth.ts`

Remove caching entirely since tokens are cheap to regenerate and the in-memory cache is lost on restart anyway:

```typescript
import { createAppAuth } from "@octokit/auth-app";
import { loadConfig, getPrivateKey } from "../config.js";

export function createAppAuthStrategy() {
  const config = loadConfig();
  return createAppAuth({
    appId: config.GITHUB_APP_ID,
    privateKey: getPrivateKey(config),
  });
}

export async function getInstallationToken(
  installationId: number
): Promise<string> {
  const auth = createAppAuthStrategy();
  const result = await auth({
    type: "installation",
    installationId,
  });
  return result.token;
}
```

**Note:** Tokens are regenerated each time, adding ~50-100ms latency per review. This is acceptable and simpler than implementing persistent caching.

---

## Testing Steps

1. **Test Migration:**
   ```bash
   bun run db:generate
   bun run db:migrate
   bunx psql $DATABASE_URL -c "SELECT * FROM review_jobs LIMIT 1;"
   ```

2. **Test Job Persistence:**
   - Open a PR
   - Verify row appears in `review_jobs` table
   - Kill the process mid-review (Ctrl+C)
   - Restart: job should resume

3. **Test Graceful Shutdown:**
   - Open a PR (triggers review)
   - Send SIGTERM: `kill -TERM <pid>`
   - Verify logs show "Shutting down gracefully..."
   - Verify review completes before exit

4. **Test Stale Job Recovery:**
   - Mark a job as "processing" manually
   - Restart the app
   - Verify it gets reset to "pending" and processed

---

## Database Migration SQL

After running `bun run db:generate`, verify the generated migration includes:

```sql
CREATE TABLE "review_jobs" (
  "id" serial PRIMARY KEY,
  "installation_id" integer NOT NULL,
  "repo_full_name" text NOT NULL,
  "owner" text NOT NULL,
  "repo" text NOT NULL,
  "pr_number" integer NOT NULL,
  "pr_title" text NOT NULL,
  "commit_sha" text NOT NULL,
  "base_branch" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "started_at" timestamp,
  "completed_at" timestamp
);

CREATE INDEX idx_review_jobs_status ON review_jobs(status);
CREATE INDEX idx_review_jobs_created ON review_jobs(created_at);
```

---

## Rollback Plan

If issues arise:
1. Revert `src/queue.ts` to use `AsyncQueue`
2. Revert `src/review/pipeline.ts` changes
3. The `review_jobs` table can remain unused
