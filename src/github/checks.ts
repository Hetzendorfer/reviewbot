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
