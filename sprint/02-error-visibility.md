# Iteration 2: Error Visibility & User Notification

**Goal:** Make review status and failures visible to users via GitHub Check Runs.

**Estimated Time:** 2-3 hours

**Priority:** High - without this, users have no idea if reviews fail.

**Depends on:** Iteration 1 (crash recovery)

---

## Tasks

### 2.1 Create Check Run Module

**File:** `src/github/checks.ts` (new file)

```typescript
import type { Octokit } from "octokit";

interface CreateCheckOptions {
  owner: string;
  repo: string;
  headSha: string;
  prNumber: number;
}

interface UpdateCheckOptions {
  owner: string;
  repo: string;
  checkRunId: number;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral" | "cancelled" | "timed_out";
  title: string;
  summary: string;
}

const CHECK_NAME = "ReviewBot";

export async function createCheckRun(
  octokit: Octokit,
  options: CreateCheckOptions
): Promise<number> {
  const response = await octokit.rest.checks.create({
    owner: options.owner,
    repo: options.repo,
    name: CHECK_NAME,
    head_sha: options.headSha,
    status: "queued",
    output: {
      title: "Review queued",
      summary: `Review is queued for processing. PR #${options.prNumber}`,
    },
  });

  return response.data.id;
}

export async function updateCheckRun(
  octokit: Octokit,
  options: UpdateCheckOptions
): Promise<void> {
  await octokit.rest.checks.update({
    owner: options.owner,
    repo: options.repo,
    check_run_id: options.checkRunId,
    status: options.status,
    conclusion: options.conclusion,
    output: {
      title: options.title,
      summary: options.summary,
    },
  });
}

export async function markCheckInProgress(
  octokit: Octokit,
  owner: string,
  repo: string,
  checkRunId: number
): Promise<void> {
  await updateCheckRun(octokit, {
    owner,
    repo,
    checkRunId,
    status: "in_progress",
    title: "Review in progress",
    summary: "Analyzing your PR changes...",
  });
}

export async function markCheckSuccess(
  octokit: Octokit,
  owner: string,
  repo: string,
  checkRunId: number,
  summary: string,
  commentCount: number
): Promise<void> {
  await updateCheckRun(octokit, {
    owner,
    repo,
    checkRunId,
    status: "completed",
    conclusion: commentCount > 0 ? "neutral" : "success",
    title: commentCount > 0 ? `Review complete (${commentCount} findings)` : "Review complete - no issues found",
    summary,
  });
}

export async function markCheckFailed(
  octokit: Octokit,
  owner: string,
  repo: string,
  checkRunId: number,
  errorMessage: string
): Promise<void> {
  await updateCheckRun(octokit, {
    owner,
    repo,
    checkRunId,
    status: "completed",
    conclusion: "failure",
    title: "Review failed",
    summary: `Review could not be completed.\n\n**Error:** ${errorMessage}`,
  });
}
```

---

### 2.2 Update Database Schema for Check Run ID

**File:** `src/db/schema.ts`

Add to `reviewJobs` table (from Iteration 1):
```typescript
checkRunId: integer("check_run_id"),
```

After migration:
```sql
ALTER TABLE review_jobs ADD COLUMN check_run_id integer;
```

---

### 2.3 Integrate Check Runs into Pipeline

**File:** `src/review/pipeline.ts`

Add import:
```typescript
import {
  createCheckRun,
  markCheckInProgress,
  markCheckSuccess,
  markCheckFailed,
} from "../github/checks.js";
```

Update `JobData` interface and `processReview` function:

```typescript
async function processReview(job: JobData): Promise<void> {
  const db = getDb();
  const config = loadConfig();
  const startTime = Date.now();

  // Get Octokit early for Check Runs
  const octokit = await getOctokit(job.installationId);

  // Create Check Run at the start
  let checkRunId: number | null = null;
  try {
    checkRunId = await createCheckRun(octokit, {
      owner: job.owner,
      repo: job.repo,
      headSha: job.commitSha,
      prNumber: job.prNumber,
    });
    
    // Store check run ID in job record
    await db
      .update(reviewJobs)
      .set({ checkRunId })
      .where(eq(reviewJobs.id, job.id));
  } catch (err) {
    console.error("Failed to create check run:", err);
  }

  // Find installation
  const [installation] = await db
    .select()
    .from(installations)
    .where(eq(installations.githubInstallationId, job.installationId))
    .limit(1);

  if (!installation) {
    console.warn(`Unknown installation: ${job.installationId}`);
    if (checkRunId) {
      await markCheckFailed(octokit, job.owner, job.repo, checkRunId, "Installation not found");
    }
    return;
  }

  // Mark as in progress
  if (checkRunId) {
    await markCheckInProgress(octokit, job.owner, job.repo, checkRunId);
  }

  // ... rest of existing code ...

  // At the end, on success:
  if (checkRunId) {
    await markCheckSuccess(
      octokit,
      job.owner,
      job.repo,
      checkRunId,
      combinedResult.summary,
      combinedResult.comments.length
    );
  }

  // In catch block, on failure:
  if (checkRunId) {
    await markCheckFailed(octokit, job.owner, job.repo, checkRunId, errorMessage);
  }
}
```

---

### 2.4 Add Retry Logic for Transient Failures

**File:** `src/utils/retry.ts` (new file)

```typescript
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts || !shouldRetry(err)) {
        throw err;
      }

      const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw lastError;
}

export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const retryablePatterns = [
    "rate limit",
    "timeout",
    "econnreset",
    "econnrefused",
    "socket hang up",
    "503",
    "502",
    "429",
  ];

  return retryablePatterns.some((pattern) => message.includes(pattern));
}
```

---

### 2.5 Apply Retry Logic to LLM Calls

**File:** `src/review/pipeline.ts`

Add import:
```typescript
import { withRetry, isRetryableError } from "../utils/retry.js";
```

Wrap LLM provider call:
```typescript
const result = await withRetry(
  () =>
    provider.review(
      {
        diff: chunk,
        prTitle: job.prTitle,
        customInstructions: mergedConfig.customInstructions,
      },
      apiKey,
      settings.llmModel
    ),
  {
    maxAttempts: 3,
    shouldRetry: isRetryableError,
  }
);
```

---

### 2.6 Add API Key Validation on Save

**File:** `src/api/settings.ts`

Add validation function. Note: Anthropic and Gemini validation is format-only or lightweight checks - full validation would require an actual API call which is slow and may incur costs.

```typescript
async function validateApiKey(
  provider: string,
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    switch (provider) {
      case "openai": {
        // Full validation: make actual API call
        const { OpenAI } = await import("openai");
        const client = new OpenAI({ apiKey });
        await client.models.list();
        return { valid: true };
      }
      case "anthropic": {
        // Format-only validation (sk-ant-... format)
        // Note: Full validation would require an API call which costs money
        if (!apiKey.startsWith("sk-ant-")) {
          return { valid: false, error: "Anthropic keys must start with 'sk-ant-'" };
        }
        if (apiKey.length < 50) {
          return { valid: false, error: "Anthropic key appears too short" };
        }
        return { valid: true };
      }
      case "gemini": {
        // Format validation: Gemini keys are typically 39 chars, alphanumeric
        // Note: getGenerativeModel() doesn't make a network call
        if (!/^[A-Za-z0-9_-]{30,}$/.test(apiKey)) {
          return { valid: false, error: "Invalid Gemini key format" };
        }
        return { valid: true };
      }
      default:
        return { valid: false, error: "Unknown provider" };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, error: `API key validation failed: ${message}` };
  }
}
```

Update PUT handler:
```typescript
if (body.apiKey && typeof body.apiKey === "string") {
  const result = await validateApiKey(body.llmProvider ?? "openai", body.apiKey);
  if (!result.valid) {
    set.status = 400;
    return { error: result.error ?? "Invalid API key" };
  }
  
  const encrypted = encrypt(body.apiKey, config.ENCRYPTION_KEY);
  updateData.apiKeyEncrypted = encrypted.ciphertext;
  updateData.apiKeyIv = encrypted.iv;
  updateData.apiKeyAuthTag = encrypted.authTag;
}
```

---

## Testing Steps

1. **Test Check Run Creation:**
   - Open a PR
   - Check GitHub PR page for "ReviewBot" check
   - Verify status transitions: queued → in_progress → completed

2. **Test Failure Visibility:**
   - Set an invalid API key
   - Open a PR
   - Verify check shows "failure" with error message

3. **Test Retry Logic:**
   - Simulate rate limit (hard to test manually)
   - Check logs for retry attempts

4. **Test API Key Validation:**
   - Try saving an invalid OpenAI key
   - Verify 400 error returned
   - Try valid key, verify accepted

---

## Database Migration

```sql
ALTER TABLE review_jobs ADD COLUMN check_run_id integer;
```

Or regenerate with `bun run db:generate` after schema update.
