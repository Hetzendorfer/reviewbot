export interface ReviewRequest {
  diff: string;
  prTitle: string;
  customInstructions?: string;
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  severity: "critical" | "warning" | "suggestion" | "nitpick";
}

export interface ReviewResult {
  summary: string;
  comments: ReviewComment[];
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LLMProvider {
  readonly name: string;
  review(
    request: ReviewRequest,
    apiKey: string,
    model: string
  ): Promise<ReviewResult>;
}
