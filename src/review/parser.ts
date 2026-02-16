import type { ReviewComment } from "../llm/types.js";

interface ParsedReview {
  summary: string;
  comments: ReviewComment[];
}

const COMMENT_REGEX =
  /###\s*\[(CRITICAL|WARNING|SUGGESTION|NITPICK)\]\s*(.+?):(\d+)\s*\n([\s\S]*?)(?=###\s*\[|$)/gi;

const SUMMARY_REGEX = /##\s*Summary\s*\n([\s\S]*?)(?=##\s*Comments|$)/i;

export function parseReviewResponse(raw: string): ParsedReview {
  const summaryMatch = SUMMARY_REGEX.exec(raw);
  const summary = summaryMatch ? summaryMatch[1].trim() : raw.split("\n")[0];

  const comments: ReviewComment[] = [];
  let match: RegExpExecArray | null;

  const commentRegex = new RegExp(COMMENT_REGEX.source, COMMENT_REGEX.flags);
  while ((match = commentRegex.exec(raw)) !== null) {
    const severity = match[1].toLowerCase() as ReviewComment["severity"];
    const path = match[2].trim();
    const line = parseInt(match[3], 10);
    const body = match[4].trim();

    if (path && line > 0 && body) {
      comments.push({ path, line, body, severity });
    }
  }

  return { summary, comments };
}
