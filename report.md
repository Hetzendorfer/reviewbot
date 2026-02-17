# ReviewBot Production Readiness Report

## Executive Summary

ReviewBot is currently in MVP state. Significant work is required before production deployment to ensure reliability, crash recovery, and multi-tenant operation. This report outlines the necessary changes organized by priority.

---

## Current State Assessment

### What Works
- Basic GitHub App integration with webhook handling
- Multi-provider LLM support (OpenAI, Anthropic, Gemini)
- Per-installation settings and API key encryption
- Async review processing queue

### Critical Gaps
| Area | Current State | Production Requirement |
|------|---------------|------------------------|
| Job Queue | In-memory, lost on restart | Persistent, recoverable |
| Token Cache | In-memory Map | Persistent or regenerated |
| Error Visibility | Console logs only | User-facing notifications |
| Monitoring | None | Health checks, metrics |
| Graceful Shutdown | None | In-flight job completion |

---

## Required Changes

### Priority 1: Crash Recovery (Critical)

#### 1.1 Persistent Job Queue

**Problem:** Current `AsyncQueue` (`src/queue.ts`) stores jobs in memory. Container restart = lost reviews.

**Solution:** Use PostgreSQL-based queue with job status tracking.

```sql
-- Add to schema
CREATE TABLE review_jobs (
  id SERIAL PRIMARY KEY,
  installation_id INT NOT NULL,
  repo_full_name TEXT NOT NULL,
  pr_number INT NOT NULL,
  pr_title TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_review_jobs_status ON review_jobs(status);
CREATE INDEX idx_review_jobs_created ON review_jobs(created_at);
```

**Implementation:**
1. On webhook: INSERT job with status='pending', return immediately
2. Background worker: SELECT pending jobs, process with row-level lock
3. On startup: Resume any 'processing' jobs (crashed mid-flight)

#### 1.2 Graceful Shutdown

**Problem:** SIGTERM kills in-flight reviews mid-process.

**Solution:**
```typescript
// src/index.ts
let shuttingDown = false;

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  shuttingDown = true;
  // Wait for active jobs, then exit
});

// In queue processor
if (shuttingDown) {
  // Don't start new jobs, let existing ones finish
}
```

#### 1.3 Token Cache Recovery

**Problem:** Installation tokens lost on restart; regeneration adds latency but is acceptable.

**Solution:** Remove caching entirely or use short-lived cache. Tokens are cheap to regenerate.

```typescript
// Simplified: just regenerate each time
export async function getInstallationToken(installationId: number): Promise<string> {
  const auth = createAppAuthStrategy();
  const result = await auth({ type: "installation", installationId });
  return result.token;
}
```

---

### Priority 2: Error Handling & Visibility (High)

#### 2.1 GitHub Check Runs for Status

**Problem:** Users have no visibility into review progress or failures.

**Solution:** Create Check Run on PR, update with status:

```typescript
// On review start
await octokit.rest.checks.create({
  owner, repo,
  name: "ReviewBot",
  head_sha: commitSha,
  status: "in_progress",
  output: { title: "Review in progress...", summary: "" }
});

// On completion
await octokit.rest.checks.update({
  check_run_id,
  status: "completed",
  conclusion: comments.length > 0 ? "neutral" : "success",
  output: { title: "Review complete", summary }
});

// On failure
await octokit.rest.checks.update({
  check_run_id,
  status: "completed",
  conclusion: "failure",
  output: { title: "Review failed", summary: errorMessage }
});
```

#### 2.2 Retry Logic for Transient Failures

**Problem:** Network blips or rate limits cause permanent failures.

**Solution:**
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await sleep(delayMs * attempt);
    }
  }
  throw new Error('Unreachable');
}
```

#### 2.3 Input Validation

**Problem:** Invalid API keys only fail at review time.

**Solution:** Validate API key on save:
```typescript
// In settings PUT handler
if (body.apiKey) {
  const valid = await validateApiKey(body.llmProvider, body.apiKey);
  if (!valid) {
    set.status = 400;
    return { error: "Invalid API key" };
  }
}
```

---

### Priority 3: Monitoring & Observability (High)

#### 3.1 Structured Logging

**Current:** `console.log` with inconsistent formats.

**Solution:** Structured JSON logging:
```typescript
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: "info",
  installationId,
  repo: repoFullName,
  pr: prNumber,
  event: "review_completed",
  durationMs,
  commentCount
}));
```

#### 3.2 Health Check Enhancement

**Current:** Simple `{ status: "ok" }`.

**Solution:**
```typescript
app.get("/health", async () => {
  const dbOk = await checkDatabaseConnection();
  const queueDepth = await getQueueDepth();
  
  return {
    status: dbOk ? "ok" : "degraded",
    database: dbOk,
    queuePending: queueDepth,
    uptime: process.uptime()
  };
});
```

#### 3.3 Metrics Endpoint (Optional but Recommended)

```typescript
app.get("/metrics", () => ({
  reviews_total: totalReviews,
  reviews_failed: failedReviews,
  avg_duration_ms: avgDuration,
  queue_depth: queueDepth
}));
```

---

### Priority 4: Multi-Tenant Safety (Medium)

#### 4.1 Per-Installation Rate Limiting

**Problem:** One busy installation can starve others (global concurrency=3).

**Solution:**
```typescript
// Track active jobs per installation
const activePerInstallation = new Map<number, number>();
const MAX_PER_INSTALLATION = 1;

// In queue processor
if ((activePerInstallation.get(installationId) ?? 0) >= MAX_PER_INSTALLATION) {
  // Re-queue for later
  return;
}
```

#### 4.2 Tenant Isolation in Logs

**Problem:** All logs mixed together.

**Solution:** Include `installationId` in every log line (see 3.1).

---

### Priority 5: Security Hardening (Medium)

#### 5.1 Webhook Raw Body

**Problem:** `JSON.stringify(body)` may not match original bytes.

**Solution:** Configure Elysia to provide raw body:
```typescript
// Use body parser that preserves raw bytes for signature verification
```

#### 5.2 Input Sanitization

**Problem:** `customInstructions` could contain prompt injection.

**Solution:** Sanitize or limit:
```typescript
const MAX_INSTRUCTIONS = 2000;
if (body.customInstructions?.length > MAX_INSTRUCTIONS) {
  return { error: "Instructions too long" };
}
```

#### 5.3 Secret Rotation Support

**Problem:** No mechanism to rotate `ENCRYPTION_KEY`.

**Solution:** Support multiple keys during transition:
```typescript
const ENCRYPTION_KEYS = [
  process.env.ENCRYPTION_KEY,
  process.env.ENCRYPTION_KEY_OLD
].filter(Boolean);
```

---

### Priority 6: Operational Improvements (Low)

#### 6.1 Database Migrations in Docker

**Current:** Manual migration step.

**Solution:** Run migrations on startup:
```typescript
// src/index.ts - before app.listen
await runMigrations();
```

#### 6.2 Configuration Validation at Startup

**Current:** Fails on first request if env vars invalid.

**Solution:** Validate and exit early:
```typescript
// src/index.ts - top level
loadConfig(); // Exits with clear error if invalid
console.log("Configuration validated");
```

#### 6.3 Docker Healthcheck

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -f http://localhost:3000/health || exit 1
```

---

## Implementation Roadmap

### Phase 1: Crash Recovery (Week 1)
1. Add `review_jobs` table and migration
2. Rewrite queue to use database
3. Add graceful shutdown handling
4. Test: kill container mid-review, verify recovery

### Phase 2: Error Visibility (Week 2)
1. Implement Check Runs API integration
2. Add retry logic with exponential backoff
3. Add API key validation on save
4. Test: force failures, verify user notification

### Phase 3: Monitoring (Week 2-3)
1. Structured JSON logging
2. Enhanced health check
3. Optional metrics endpoint
4. Test: review logs for debugging

### Phase 4: Polish (Week 3-4)
1. Per-installation rate limiting
2. Webhook raw body fix
3. Input validation/sanitization
4. Docker healthcheck

---

## Effort Estimate

| Priority | Effort | Risk if Skipped |
|----------|--------|-----------------|
| 1. Crash Recovery | 3-4 days | Lost reviews on restart |
| 2. Error Visibility | 2-3 days | Silent failures, user frustration |
| 3. Monitoring | 1-2 days | Unable to debug production issues |
| 4. Multi-Tenant | 1 day | One user impacts others |
| 5. Security | 1 day | Potential vulnerabilities |
| 6. Operations | 0.5 days | Manual intervention required |

**Total: 8-12 days of development work**

---

## Scaling Considerations

The proposed architecture supports your requirements:
- **5 projects**: Trivial (no changes needed)
- **10 users**: Trivial (GitHub handles auth)
- **Single container**: Fully supported with persistent queue

If you later need to scale beyond single instance:
- Move queue to external service (Redis, or keep DB-based)
- Add load balancer
- No code changes required for DB-based queue

---

## Files to Modify

```
src/
├── db/
│   └── schema.ts           # Add review_jobs table
├── queue.ts                # Rewrite for DB persistence
├── index.ts                # Graceful shutdown, migration on start
├── review/
│   └── pipeline.ts         # Check Runs integration, retry logic
├── api/
│   └── settings.ts         # API key validation
└── github/
    └── webhooks.ts         # Raw body handling

drizzle/
└── 0001_add_review_jobs.sql  # New migration
```

---

## Conclusion

ReviewBot requires 8-12 days of focused development to reach production readiness. The critical path is crash recovery via persistent job queueing. Without this, any container restart (deployment, crash, resource limits) will lose in-flight reviews with no recovery mechanism.

The recommended approach prioritizes reliability over features, ensuring users can trust the system to complete reviews and notify them of any issues.
