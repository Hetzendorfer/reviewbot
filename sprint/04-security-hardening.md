# Iteration 4: Security & Operational Hardening

**Goal:** Fix security issues and improve operational reliability.

**Estimated Time:** 1-2 hours

**Priority:** Medium - important but not blocking for initial deployment.

**Depends on:** Iteration 1, 2, 3

---

## Tasks

### 4.1 Fix Webhook Signature Verification

**Problem:** `JSON.stringify(body)` may not match original request bytes.

**File:** `src/api/webhooks/github.ts`

Use Elysia's `parse: "text"` option to get raw body directly:

```typescript
import { Elysia } from "elysia";
import { loadConfig } from "../../config.js";
import {
  verifyWebhookSignature,
  isPullRequestEvent,
  type PullRequestEvent,
} from "../../github/webhooks.js";
import { enqueueReview } from "../../review/pipeline.js";
import { logger } from "../../logger.js";

export const githubWebhookHandler = new Elysia().post(
  "/webhooks/github",
  async ({ body, set, request }) => {
    const config = loadConfig();
    const signature = request.headers.get("x-hub-signature-256");
    const event = request.headers.get("x-github-event");

    // With parse: "text", body IS the raw string
    const rawBody = body as string;

    if (
      !verifyWebhookSignature(rawBody, signature, config.GITHUB_WEBHOOK_SECRET)
    ) {
      logger.warn("Invalid webhook signature");
      set.status = 401;
      return { error: "Invalid signature" };
    }

    if (!event) {
      set.status = 400;
      return { error: "Missing event header" };
    }

    // Parse the raw body
    let payload: PullRequestEvent;
    try {
      payload = JSON.parse(rawBody) as PullRequestEvent;
    } catch {
      set.status = 400;
      return { error: "Invalid JSON payload" };
    }

    logger.info("Webhook received", {
      event,
      repo: payload.repository?.full_name,
      action: payload.action,
    });

    if (isPullRequestEvent(event, payload)) {
      const [owner, repo] = payload.repository.full_name.split("/");

      // Note: enqueueReview is now async with idempotency checks
      // We await it to ensure proper error handling
      await enqueueReview({
        installationId: payload.installation.id,
        owner,
        repo,
        prNumber: payload.number,
        prTitle: payload.pull_request.title,
        commitSha: payload.pull_request.head.sha,
        baseBranch: payload.pull_request.base.ref,
        repoFullName: payload.repository.full_name,
      });

      logger.info("Review queued", {
        installationId: payload.installation.id,
        repo: payload.repository.full_name,
        pr: payload.number,
      });

      return { status: "queued" };
    }

    return { status: "ignored" };
  },
  {
    // Body will be raw text string, not parsed JSON
    parse: "text",
  }
);
```

---

### 4.2 Expand Webhook Event Handling

**File:** `src/github/webhooks.ts`

Add support for more PR events:

```typescript
export function isPullRequestEvent(
  event: string,
  payload: PullRequestEvent
): boolean {
  if (event !== "pull_request") return false;

  const validActions = [
    "opened",
    "synchronize",
    "reopened",
    "ready_for_review", // Draft -> Ready
  ];

  return validActions.includes(payload.action);
}

// Add type for draft detection
export interface PullRequestEvent {
  action: string;
  number: number;
  pull_request: {
    title: string;
    head: { sha: string };
    base: { ref: string };
    diff_url: string;
    draft?: boolean;
  };
  repository: {
    full_name: string;
    default_branch: string;
  };
  installation: {
    id: number;
  };
}
```

---

### 4.3 Add Webhook Idempotency

**Problem:** Rapid pushes queue duplicate reviews.

**File:** `src/review/pipeline.ts`

Add check before enqueuing:

```typescript
import { and, eq, gte } from "drizzle-orm";
import { reviewJobs } from "../db/schema.js";

export async function enqueueReview(job: JobData): Promise<void> {
  const db = getDb();

  // Check for recent pending/processing job for same PR
  const recentJob = await db
    .select()
    .from(reviewJobs)
    .where(
      and(
        eq(reviewJobs.repoFullName, job.repoFullName),
        eq(reviewJobs.prNumber, job.prNumber),
        eq(reviewJobs.commitSha, job.commitSha),
        sql`${reviewJobs.status} IN ('pending', 'processing')`
      )
    )
    .limit(1);

  if (recentJob.length > 0) {
    logger.info("Skipping duplicate review request", {
      repo: job.repoFullName,
      pr: job.prNumber,
      existingJobId: recentJob[0].id,
    });
    return;
  }

  // Check for recently completed job (within 5 minutes)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentComplete = await db
    .select()
    .from(reviewJobs)
    .where(
      and(
        eq(reviewJobs.repoFullName, job.repoFullName),
        eq(reviewJobs.prNumber, job.prNumber),
        eq(reviewJobs.commitSha, job.commitSha),
        eq(reviewJobs.status, "completed"),
        gte(reviewJobs.completedAt, fiveMinutesAgo)
      )
    )
    .limit(1);

  if (recentComplete.length > 0) {
    logger.info("Skipping recently completed review", {
      repo: job.repoFullName,
      pr: job.prNumber,
    });
    return;
  }

  // Proceed with enqueue
  if (!reviewQueue) {
    logger.error("Queue not started");
    return;
  }

  reviewQueue.enqueue(job).catch((err) => {
    logger.error("Failed to enqueue review", { error: String(err) });
  });
}
```

---

### 4.4 Add Input Sanitization

**File:** `src/api/settings.ts`

Add validation at the top:

```typescript
const MAX_INSTRUCTIONS_LENGTH = 2000;
const MAX_IGNORE_PATHS = 50;
const MAX_PATH_LENGTH = 256;

function validateSettings(body: Record<string, unknown>): string | null {
  if (body.customInstructions && typeof body.customInstructions === "string") {
    if (body.customInstructions.length > MAX_INSTRUCTIONS_LENGTH) {
      return `Custom instructions too long (max ${MAX_INSTRUCTIONS_LENGTH} chars)`;
    }
  }

  if (body.ignorePaths && Array.isArray(body.ignorePaths)) {
    if (body.ignorePaths.length > MAX_IGNORE_PATHS) {
      return `Too many ignore paths (max ${MAX_IGNORE_PATHS})`;
    }
    for (const path of body.ignorePaths) {
      if (typeof path !== "string" || path.length > MAX_PATH_LENGTH) {
        return "Invalid ignore path";
      }
    }
  }

  if (body.maxFilesPerReview !== undefined) {
    const max = Number(body.maxFilesPerReview);
    if (isNaN(max) || max < 1 || max > 100) {
      return "maxFilesPerReview must be between 1 and 100";
    }
  }

  return null;
}
```

Use in PUT handler:
```typescript
.put(
  "/:installationId",
  async ({ params, body, set }) => {
    const validationError = validateSettings(body as Record<string, unknown>);
    if (validationError) {
      set.status = 400;
      return { error: validationError };
    }
    
    // ... rest of handler
  },
  // ... body schema
);
```

---

### 4.5 Add Request Timeout Configuration

**File:** `src/config.ts`

Add to envSchema:
```typescript
LLM_TIMEOUT_MS: z.coerce.number().default(120000), // 2 minutes
GITHUB_TIMEOUT_MS: z.coerce.number().default(30000), // 30 seconds
```

---

### 4.6 Add Docker Healthcheck

**File:** `Dockerfile`

Add before `CMD`:
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

---

### 4.7 Run Migrations on Startup

**File:** `src/index.ts`

Add migration check before app starts. This is the recommended approach (not the shell script in iteration 05).

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function runMigrations(): Promise<void> {
  const config = loadConfig();
  const client = postgres(config.DATABASE_URL, { max: 1 });
  const db = drizzle(client);
  
  logger.info("Running database migrations...");
  
  await migrate(db, { migrationsFolder: "./drizzle" });
  
  await client.end();
  logger.info("Migrations complete");
}

// At the top, before app initialization:
runMigrations()
  .then(() => {
    startQueue();
    app.listen({ port: config.PORT, hostname: config.HOST });
    logger.info(`ReviewBot running at http://${config.HOST}:${config.PORT}`);
  })
  .catch((err) => {
    logger.error("Failed to start", { error: String(err) });
    process.exit(1);
  });
```

**Note:** Do NOT use the `scripts/start.sh` approach from iteration 05. Use this programmatic migration instead.

---

### 4.8 Add Per-Installation Rate Limiting

**File:** `src/queue.ts`

Add tracking to the PersistentQueue class from iteration 1:

```typescript
export class PersistentQueue {
  private handler: JobHandler;
  private concurrency: number;
  private running = 0;
  private runningPerInstallation = new Map<number, number>();
  private maxPerInstallation = 1;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private shuttingDown = false;

  // Update the poll method from iteration 1 to include per-installation limit:
  private async poll(): Promise<void> {
    if (this.shuttingDown) return;
    if (this.running >= this.concurrency) return;

    const db = getDb();

    // Find installations at capacity
    const runningInstallations = Array.from(this.runningPerInstallation.entries())
      .filter(([, count]) => count >= this.maxPerInstallation)
      .map(([id]) => id);

    // Build exclusion clause for installations at capacity
    const excludeClause = runningInstallations.length > 0
      ? sql`AND installation_id NOT IN (${sql.join(
          runningInstallations.map((id) => sql`${id}`),
          sql`, `
        )})`
      : sql``;

    // Use FOR UPDATE SKIP LOCKED to claim exactly one job
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
      RETURNING *
    `);

    const job = result.rows[0];
    if (!job) return;

    const typedJob = job as typeof reviewJobs.$inferSelect;
    
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
}
```

---

## Testing Steps

1. **Test Webhook Signature:**
   - Send webhook with modified payload
   - Verify 401 response

2. **Test Idempotency:**
   - Trigger same webhook twice rapidly
   - Verify only one job created

3. **Test Input Validation:**
   - Send oversized customInstructions
   - Verify 400 error

4. **Test Migration on Startup:**
   ```bash
   docker compose down -v
   docker compose up
   # Verify "Running database migrations" in logs
   ```

5. **Test Healthcheck:**
   ```bash
   docker ps
   # Verify container shows "healthy"
   ```

---

## Security Checklist

- [x] Webhook signature verification uses raw body
- [x] Input validation on all user inputs
- [x] API key validated before storage
- [x] No secrets in logs
- [x] Encrypted API keys at rest
- [x] Rate limiting per installation
- [x] Idempotency prevents duplicate work
