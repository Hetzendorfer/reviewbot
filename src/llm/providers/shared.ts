import { parseReviewResponse } from "../../review/parser.js";
import type { ReviewResult } from "../types.js";

export function buildReviewResult(
  text: string,
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  }
): ReviewResult {
  const parsed = parseReviewResponse(text);
  const hasUsage =
    usage?.inputTokens !== undefined || usage?.outputTokens !== undefined;

  return {
    ...parsed,
    usage: hasUsage
      ? {
          promptTokens: usage?.inputTokens ?? 0,
          completionTokens: usage?.outputTokens ?? 0,
        }
      : undefined,
  };
}
