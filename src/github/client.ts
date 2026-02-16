import { Octokit } from "octokit";
import { getInstallationToken } from "./auth.js";

export async function getOctokit(installationId: number): Promise<Octokit> {
  const token = await getInstallationToken(installationId);
  return new Octokit({ auth: token });
}

export async function fetchPRDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const response = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  });
  return response.data as unknown as string;
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
}

export async function postReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  commitSha: string,
  body: string,
  comments: ReviewComment[]
): Promise<void> {
  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: commitSha,
    body,
    event: "COMMENT",
    comments: comments.map((c) => ({
      path: c.path,
      line: c.line,
      body: c.body,
    })),
  });
}

export async function fetchFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    const data = response.data as { content?: string; encoding?: string };
    if (data.content && data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return null;
  } catch {
    return null;
  }
}
