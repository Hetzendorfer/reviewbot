# Iteration 3: Monitoring & Observability

**Goal:** Enable debugging and production monitoring through structured logging and health checks.

**Estimated Time:** 1-2 hours

**Priority:** High - essential for production troubleshooting.

**Depends on:** Iteration 1, 2

---

## Tasks

### 3.1 Create Structured Logger

**File:** `src/logger.ts` (new file)

```typescript
type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  installationId?: number;
  repo?: string;
  pr?: number;
  jobId?: number;
  [key: string]: unknown;
}

function formatLog(
  level: LogLevel,
  message: string,
  context?: LogContext
): string {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  return JSON.stringify(entry);
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (process.env.LOG_LEVEL === "debug") {
      console.debug(formatLog("debug", message, context));
    }
  },

  info(message: string, context?: LogContext): void {
    console.log(formatLog("info", message, context));
  },

  warn(message: string, context?: LogContext): void {
    console.warn(formatLog("warn", message, context));
  },

  error(message: string, context?: LogContext): void {
    console.error(formatLog("error", message, context));
  },

  // Convenience method for request context
  withContext(defaultContext: LogContext) {
    return {
      debug: (message: string, context?: LogContext) =>
        logger.debug(message, { ...defaultContext, ...context }),
      info: (message: string, context?: LogContext) =>
        logger.info(message, { ...defaultContext, ...context }),
      warn: (message: string, context?: LogContext) =>
        logger.warn(message, { ...defaultContext, ...context }),
      error: (message: string, context?: LogContext) =>
        logger.error(message, { ...defaultContext, ...context }),
    };
  },
};
```

---

### 3.2 Update Pipeline to Use Structured Logging

**File:** `src/review/pipeline.ts`

Replace all `console.log`, `console.warn`, `console.error` calls:

```typescript
import { logger } from "../logger.js";

async function processReview(job: JobData): Promise<void> {
  const log = logger.withContext({
    installationId: job.installationId,
    repo: job.repoFullName,
    pr: job.prNumber,
    jobId: job.id,
  });

  log.info("Starting review");

  // ... in try block ...
  log.info("Review completed", {
    durationMs,
    commentCount: combinedResult.comments.length,
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
  });

  // ... in catch block ...
  log.error("Review failed", { error: errorMessage });

  // ... guard clauses ...
  log.warn("Installation not found");
  log.warn("Reviews disabled");
  log.warn("No API key configured");
}
```

---

### 3.3 Update Queue to Use Structured Logging

**File:** `src/queue.ts`

```typescript
import { logger } from "./logger.js";

// In enqueue method:
logger.info("Job enqueued", { 
  installationId: data.installationId, 
  repo: data.repoFullName, 
  pr: data.prNumber 
});

// In processJob:
logger.debug("Processing job", { jobId: job.id });
logger.info("Job completed", { jobId: job.id });
logger.error("Job failed", { jobId: job.id, error: errorMessage, attempts: job.attempts });

// In recoverStaleJobs:
logger.info("Recovering stale jobs", { count: staleJobs.length });
```

---

### 3.4 Enhance Health Check Endpoint

**File:** `src/index.ts`

Add import and health check function:

```typescript
import { getDb } from "./db/index.js";
import { sql } from "drizzle-orm";
import { reviewJobs } from "./db/schema.js";

async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

async function getQueueStats(): Promise<{ pending: number; processing: number; failed: number }> {
  try {
    const db = getDb();
    const stats = await db
      .select({
        status: reviewJobs.status,
        count: sql<number>`count(*)`,
      })
      .from(reviewJobs)
      .groupBy(reviewJobs.status);

    return {
      pending: stats.find((s) => s.status === "pending")?.count ?? 0,
      processing: stats.find((s) => s.status === "processing")?.count ?? 0,
      failed: stats.find((s) => s.status === "failed")?.count ?? 0,
    };
  } catch {
    return { pending: 0, processing: 0, failed: 0 };
  }
}
```

Update health endpoint:
```typescript
.get("/health", async () => {
  const dbOk = await checkDatabaseConnection();
  const queueStats = await getQueueStats();

  const status = dbOk ? "ok" : "degraded";

  return {
    status,
    database: dbOk,
    queue: queueStats,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };
})
```

---

### 3.5 Add Metrics Endpoint (Optional)

**File:** `src/index.ts`

Add after health endpoint:

```typescript
.get("/metrics", async () => {
  const db = getDb();
  
  const totalReviews = await db
    .select({ count: sql<number>`count(*)` })
    .from(reviews);

  const failedReviews = await db
    .select({ count: sql<number>`count(*)` })
    .from(reviews)
    .where(eq(reviews.status, "failed"));

  const avgDuration = await db
    .select({ avg: sql<number>`avg(duration_ms)` })
    .from(reviews)
    .where(sql`duration_ms IS NOT NULL`);

  const queueStats = await getQueueStats();

  return {
    reviews: {
      total: totalReviews[0]?.count ?? 0,
      failed: failedReviews[0]?.count ?? 0,
      avgDurationMs: Math.round(avgDuration[0]?.avg ?? 0),
    },
    queue: queueStats,
  };
})
```

---

### 3.6 Update Webhook Handler Logging

**File:** `src/api/webhooks/github.ts`

```typescript
import { logger } from "../../logger.js";

// In handler:
logger.info("Webhook received", { 
  event, 
  repo: payload.repository?.full_name,
  action: payload.action 
});

logger.info("Review queued", {
  installationId: payload.installation.id,
  repo: payload.repository.full_name,
  pr: payload.number,
});

logger.warn("Invalid webhook signature");
```

---

### 3.7 Update Config for Log Level

**File:** `src/config.ts`

Add to envSchema:
```typescript
LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
```

---

## Testing Steps

1. **Test Structured Logging:**
   ```bash
   LOG_LEVEL=debug bun run dev
   # Open a PR, check logs are JSON formatted
   ```

2. **Test Health Endpoint:**
   ```bash
   curl http://localhost:3000/health
   # Should return JSON with status, database, queue stats
   ```

3. **Test Metrics Endpoint:**
   ```bash
   curl http://localhost:3000/metrics
   # Should return review counts and averages
   ```

4. **Test Database Failure Handling:**
   - Stop PostgreSQL
   - Hit `/health`
   - Verify `status: "degraded"` and `database: false`

---

## Example Log Output

```json
{"timestamp":"2024-01-15T10:30:00.000Z","level":"info","message":"Webhook received","event":"pull_request","repo":"owner/repo","action":"opened"}
{"timestamp":"2024-01-15T10:30:00.100Z","level":"info","message":"Review queued","installationId":123,"repo":"owner/repo","pr":42}
{"timestamp":"2024-01-15T10:30:05.500Z","level":"info","message":"Review completed","installationId":123,"repo":"owner/repo","pr":42,"durationMs":5400,"commentCount":3}
```

---

## Log Aggregation Setup (Production)

In Coolify/Docker, logs can be collected via:
- Docker logs driver
- Filebeat/Fluentd
- Direct integration with logging services

The JSON format makes parsing easy for any log aggregation system.

**Note on Log Rotation:** Since logs are written to stdout/stderr, Docker handles rotation automatically. No need for application-level log rotation. In Coolify, configure log retention policies in the dashboard if needed.
