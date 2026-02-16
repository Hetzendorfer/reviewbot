import type { Octokit } from "octokit";
import { postReview } from "../github/client.js";
import type { ReviewComment } from "../llm/types.js";

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "🔴",
  warning: "🟡",
  suggestion: "🔵",
  nitpick: "⚪",
};

function formatSummary(summary: string, commentCount: number): string {
  let body = `## ReviewBot Summary\n\n${summary}\n\n`;
  if (commentCount > 0) {
    body += `---\n*${commentCount} inline comment(s) posted.*`;
  } else {
    body += `---\n*No issues found. Looks good!*`;
  }
  return body;
}

function formatInlineComment(comment: ReviewComment): string {
  const emoji = SEVERITY_EMOJI[comment.severity] ?? "";
  return `${emoji} **${comment.severity.toUpperCase()}**\n\n${comment.body}`;
}

export async function postReviewToGitHub(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  commitSha: string,
  summary: string,
  comments: ReviewComment[],
  reviewStyle: "inline" | "summary" | "both"
): Promise<void> {
  const formattedBody = formatSummary(summary, comments.length);

  const inlineComments =
    reviewStyle === "summary"
      ? []
      : comments.map((c) => ({
          path: c.path,
          line: c.line,
          body: formatInlineComment(c),
        }));

  const body = reviewStyle === "inline" ? "" : formattedBody;

  await postReview(
    octokit,
    owner,
    repo,
    prNumber,
    commitSha,
    body,
    inlineComments
  );
}
