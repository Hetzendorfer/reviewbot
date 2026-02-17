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
import type { ReviewResult } from "../llm/types.js";

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

export function enqueueReview(job: JobData): void {
  if (!reviewQueue) {
    console.error("Queue not started");
    return;
  }
  reviewQueue.enqueue(job).catch((err) => {
    console.error(`Failed to enqueue review for ${job.repoFullName}#${job.prNumber}:`, err);
  });
}

async function processReview(job: JobData): Promise<void> {
  const db = getDb();
  const config = loadConfig();
  const startTime = Date.now();

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
    console.error("Failed to create check run:", err);
  }

  const [installation] = await db
    .select()
    .from(installations)
    .where(eq(installations.githubInstallationId, job.installationId))
    .limit(1);

  if (!installation) {
    console.warn(`Unknown installation: ${job.installationId}`);
    if (checkRunId) {
      try {
        await markCheckFailed(octokit, job.owner, job.repo, checkRunId, "Installation not found");
      } catch (err) {
        console.error("Failed to update check run:", err);
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
    console.log(`Reviews disabled for installation ${job.installationId}`);
    if (checkRunId) {
      try {
        await markCheckFailed(octokit, job.owner, job.repo, checkRunId, "Reviews disabled for this installation");
      } catch (err) {
        console.error("Failed to update check run:", err);
      }
    }
    return;
  }

  if (!settings.apiKeyEncrypted || !settings.apiKeyIv || !settings.apiKeyAuthTag) {
    console.warn(`No API key configured for installation ${job.installationId}`);
    if (checkRunId) {
      try {
        await markCheckFailed(octokit, job.owner, job.repo, checkRunId, "No API key configured");
      } catch (err) {
        console.error("Failed to update check run:", err);
      }
    }
    return;
  }

  if (checkRunId) {
    try {
      await markCheckInProgress(octokit, job.owner, job.repo, checkRunId);
    } catch (err) {
      console.error("Failed to update check run:", err);
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

    console.log(
      `Review completed for ${job.repoFullName}#${job.prNumber} in ${durationMs}ms`
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Review error for ${job.repoFullName}#${job.prNumber}:`, errorMessage);

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
