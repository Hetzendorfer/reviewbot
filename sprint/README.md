# Sprint Plan: Production Readiness

**Total Estimated Time:** 8-12 hours

**Target:** Deploy ReviewBot to Coolify for 5 projects and 10 users with crash recovery.

---

## Iteration Summary

| # | Iteration | Priority | Time | Status |
|---|-----------|----------|------|--------|
| 01 | [Crash Recovery Foundation](./01-crash-recovery.md) | Critical | 3-4h | **Completed** |
| 02 | [Error Visibility & User Notification](./02-error-visibility.md) | High | 2-3h | **Completed** |
| 03 | [Monitoring & Observability](./03-monitoring-observability.md) | High | 1-2h | Pending |
| 04 | [Security & Operational Hardening](./04-security-hardening.md) | Medium | 1-2h | Pending |
| 05 | [Deployment Preparation](./05-deployment.md) | Low | 1h | Pending |

---

## Dependency Graph

```
01-crash-recovery (foundation)
       │
       ├──────────────┬──────────────┐
       │              │              │
       ▼              ▼              ▼
02-error-visibility  03-monitoring  04-security
       │              │              │
       └──────────────┴──────────────┘
                      │
                      ▼
              05-deployment
```

---

## What Each Iteration Delivers

### Iteration 1: Crash Recovery
- Persistent job queue in PostgreSQL
- Graceful shutdown handling
- Stale job recovery on restart
- **Result:** No lost reviews on container restart

### Iteration 2: Error Visibility
- GitHub Check Runs integration
- Retry logic for transient failures
- API key validation
- **Result:** Users see review status and failures

### Iteration 3: Monitoring
- Structured JSON logging
- Enhanced health checks
- Metrics endpoint
- **Result:** Debuggable production system

### Iteration 4: Security
- Webhook raw body verification
- Input sanitization
- Per-installation rate limiting
- Idempotency
- **Result:** Secure, reliable operation

### Iteration 5: Deployment
- Docker configuration
- Coolify setup guide
- Deployment checklist
- **Result:** Ready for production

---

## Testing Strategy

After each iteration:

1. **Unit tests** - Run `bun test`
2. **Type check** - Run `bunx tsc --noEmit`
3. **Integration test** - Open a test PR
4. **Crash test** - Kill container, verify recovery

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Database migration fails | Test locally first, have rollback SQL ready |
| LLM API changes | Provider abstraction allows easy updates |
| GitHub API limits | Per-installation rate limiting |
| Memory leaks | Monitor with `/health` and `/metrics` |

---

## Success Criteria

After all iterations:

- [ ] Container restart does not lose in-flight reviews
- [ ] Failed reviews show up as failed Check Runs
- [ ] Health endpoint reports database and queue status
- [ ] Logs are JSON formatted and parseable
- [ ] Webhook signature verification works correctly
- [ ] System handles 5 projects and 10 users without issues
- [ ] Deployed to Coolify with automatic migrations

---

## Key Implementation Notes

### Job Queue Concurrency (Iteration 1)

The queue uses PostgreSQL's `FOR UPDATE SKIP LOCKED` pattern to safely claim jobs. This prevents:
- Multiple workers grabbing the same job
- Race conditions when scaling horizontally
- Phantom "processing" jobs on crash

```sql
WHERE id = (SELECT id FROM review_jobs WHERE ... LIMIT 1 FOR UPDATE SKIP LOCKED)
```

### Async enqueueReview (Iteration 4)

The `enqueueReview` function is async because it performs idempotency checks. The webhook handler must `await` it:

```typescript
await enqueueReview({ ... });
```

### Migrations (Iteration 4)

Migrations run programmatically on app startup (section 4.7), not via shell script. This ensures consistent behavior in Docker and local development.

### API Key Validation (Iteration 2)

- OpenAI: Full validation via API call
- Anthropic: Format-only (`sk-ant-*` prefix check)
- Gemini: Format-only (alphanumeric pattern)

Format-only validation means invalid keys may be accepted but will fail at review time.
