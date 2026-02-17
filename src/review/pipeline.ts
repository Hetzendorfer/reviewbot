import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { installations, installationSettings, reviews, reviewJobs } from "../db/schema.js";
import { getOctokit, fetchPRDiff } from "../github/client.js";
import { getProvider } from "../llm/registry.js";
import { decrypt } from "../crypto.js";
import { loadConfig } from "../config.js";
import { parseDiff, filterFiles, chunkDiffs } from "./differ.js";
import { postReviewToGitHub } from "./poster.js";
import { fetchRepoConfig, mergeConfig } from "../repo-config.js";
import { PersistentQueue, type JobData } from "../queue.js";
import {
  createCheckRun,
  markCheckInProgress,
  markCheckSuccess,
  markCheckFailed,
} from "../github/checks.js";
import { withRetry, isRetryableError } from "../utils/retry.js";
import { logger } from "../logger.js";
import type { ReviewResult } from "../llm/types.js";

let reviewQueue: PersistentQueue | null = null;

export function startQueue(): void {
  reviewQueue = new PersistentQueue(processReview, 3);
  reviewQueue.recoverStaleJobs().then(() => {
    reviewQueue!.start();
    logger.info("Review queue started");
  });
}

export function stopQueue(): Promise<void> {
  if (!reviewQueue) return Promise.resolve();
  reviewQueue.stop();
  return reviewQueue.waitForCompletion();
}

export async function getQueueStats(): Promise<{ pending: number; processing: number; failed: number }> {
  if (!reviewQueue) return { pending: 0, processing: 0, failed: 0 };
  return reviewQueue.getQueueStats();
}

export function enqueueReview(job: JobData): void {
  if (!reviewQueue) {
    logger.error("Queue not started");
    return;
  }
  reviewQueue.enqueue(job).catch((err) => {
    logger.error("Failed to enqueue review", {
      repo: job.repoFullName,
      pr: job.prNumber,
      error: String(err),
    });
  });
}

async function processReview(job: JobData): Promise<void> {
  const db = getDb();
  const config = loadConfig();
  const startTime = Date.now();

  const log = logger.withContext({
    installationId: job.installationId,
    repo: job.repoFullName,
    pr: job.prNumber,
    jobId: job.id,
  });

  log.info("Starting review");

  const octokit = await withRetry(
    () => getOctokit(job.installationId),
    { maxAttempts: 3, shouldRetry: isRetryableError }
  );

  let checkRunId: number | null = null;
  try {
    checkRunId = await createCheckRun(octokit, {
      owner: job.owner,
      repo: job.repo,
      headSha: job.commitSha,
      prNumber: job.prNumber,
    });

    if (job.id) {
      await db
        .update(reviewJobs)
        .set({ checkRunId })
        .where(eq(reviewJobs.id, job.id));
    }
  } catch (err) {
    log.error("Failed to create check run", { error: String(err) });
  }

  const [installation] = await db
    .select()
    .from(installations)
    .where(eq(installations.githubInstallationId, job.installationId))
    .limit(1);

  if (!installation) {
    log.warn("Installation not found");
    if (checkRunId) {
      try {
        await markCheckFailed(octokit, job.owner, job.repo, checkRunId, "Installation not found");
      } catch (err) {
        log.error("Failed to update check run", { error: String(err) });
      }
    }
    return;
  }

  const [settings] = await db
    .select()
    .from(installationSettings)
    .where(eq(installationSettings.installationId, installation.id))
    .limit(1);

  if (!settings || !settings.enabled) {
    log.info("Reviews disabled for installation");
    if (checkRunId) {
      try {
        await markCheckFailed(octokit, job.owner, job.repo, checkRunId, "Reviews disabled for this installation");
      } catch (err) {
        log.error("Failed to update check run", { error: String(err) });
      }
    }
    return;
  }

  if (!settings.apiKeyEncrypted || !settings.apiKeyIv || !settings.apiKeyAuthTag) {
    log.warn("No API key configured");
    if (checkRunId) {
      try {
        await markCheckFailed(octokit, job.owner, job.repo, checkRunId, "No API key configured");
      } catch (err) {
        log.error("Failed to update check run", { error: String(err) });
      }
    }
    return;
  }

  if (checkRunId) {
    try {
      await markCheckInProgress(octokit, job.owner, job.repo, checkRunId);
    } catch (err) {
      log.error("Failed to update check run", { error: String(err) });
    }
  }

  const [review] = await db
    .insert(reviews)
    .values({
      installationId: installation.id,
      repoFullName: job.repoFullName,
      prNumber: job.prNumber,
      prTitle: job.prTitle,
      commitSha: job.commitSha,
      llmProvider: settings.llmProvider,
      llmModel: settings.llmModel,
      status: "processing",
    })
    .returning();

  try {
    const repoConfig = await fetchRepoConfig(
      octokit,
      job.owner,
      job.repo,
      job.baseBranch
    );
    const mergedConfig = mergeConfig(settings, repoConfig);

    if (!mergedConfig.enabled) {
      await db
        .update(reviews)
        .set({ status: "completed", summaryComment: "Skipped (disabled via repo config)" })
        .where(eq(reviews.id, review.id));
      if (checkRunId) {
        await markCheckSuccess(octokit, job.owner, job.repo, checkRunId, "Skipped (disabled via repo config)", 0);
      }
      return;
    }

    const rawDiff = await fetchPRDiff(octokit, job.owner, job.repo, job.prNumber);
    const files = parseDiff(rawDiff);
    const filtered = filterFiles(
      files,
      mergedConfig.ignorePaths,
      mergedConfig.maxFilesPerReview
    );

    if (filtered.length === 0) {
      await db
        .update(reviews)
        .set({ status: "completed", summaryComment: "No reviewable files." })
        .where(eq(reviews.id, review.id));
      if (checkRunId) {
        await markCheckSuccess(octokit, job.owner, job.repo, checkRunId, "No reviewable files.", 0);
      }
      return;
    }

    const apiKey = decrypt(
      {
        ciphertext: settings.apiKeyEncrypted,
        iv: settings.apiKeyIv,
        authTag: settings.apiKeyAuthTag,
      },
      config.ENCRYPTION_KEY
    );

    const provider = getProvider(settings.llmProvider);
    const chunks = chunkDiffs(filtered);

    let combinedResult: ReviewResult = { summary: "", comments: [] };
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    for (const chunk of chunks) {
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
      combinedResult.comments.push(...result.comments);
      if (result.summary) {
        combinedResult.summary += (combinedResult.summary ? "\n\n" : "") + result.summary;
      }
      if (result.usage) {
        totalPromptTokens += result.usage.promptTokens;
        totalCompletionTokens += result.usage.completionTokens;
      }
    }

    await postReviewToGitHub(
      octokit,
      job.owner,
      job.repo,
      job.prNumber,
      job.commitSha,
      combinedResult.summary,
      combinedResult.comments,
      mergedConfig.reviewStyle
    );

    const durationMs = Date.now() - startTime;

    await db
      .update(reviews)
      .set({
        status: "completed",
        summaryComment: combinedResult.summary,
        inlineCommentCount: combinedResult.comments.length,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        durationMs,
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, review.id));

    if (checkRunId) {
      await markCheckSuccess(
        octokit,
        job.owner,
        job.repo,
        checkRunId,
        combinedResult.summary || "Review completed.",
        combinedResult.comments.length
      );
    }

    log.info("Review completed", {
      durationMs,
      commentCount: combinedResult.comments.length,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error("Review failed", { error: errorMessage });

    await db
      .update(reviews)
      .set({
        status: "failed",
        errorMessage,
        durationMs: Date.now() - startTime,
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, review.id));

    if (checkRunId) {
      await markCheckFailed(octokit, job.owner, job.repo, checkRunId, errorMessage);
    }
  }
}
