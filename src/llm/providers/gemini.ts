import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider, ReviewRequest, ReviewResult } from "../types.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "../prompts.js";
import { parseReviewResponse } from "../../review/parser.js";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  async review(
    request: ReviewRequest,
    apiKey: string,
    model: string
  ): Promise<ReviewResult> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const genModel = genAI.getGenerativeModel({
      model,
      systemInstruction: SYSTEM_PROMPT,
    });

    const result = await genModel.generateContent(
      buildUserPrompt(
        request.prTitle,
        request.diff,
        request.customInstructions
      )
    );

    const response = result.response;
    const content = response.text();
    const parsed = parseReviewResponse(content);

    const usage = response.usageMetadata;
    return {
      ...parsed,
      usage: usage
        ? {
            promptTokens: usage.promptTokenCount ?? 0,
            completionTokens: usage.candidatesTokenCount ?? 0,
          }
        : undefined,
    };
  }
}
