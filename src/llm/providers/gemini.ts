import { generateText } from "ai";
import type { LLMProvider, ReviewRequest, ReviewResult } from "../types.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "../prompts.js";
import { createProviderModel } from "../provider-factory.js";
import { buildReviewResult } from "./shared.js";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  async review(
    request: ReviewRequest,
    apiKey: string,
    model: string
  ): Promise<ReviewResult> {
    const response = await generateText({
      model: createProviderModel("gemini", apiKey, model),
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(
        request.prTitle,
        request.diff,
        request.customInstructions
      ),
      temperature: 0.1,
    });

    return buildReviewResult(response.text, response.usage);
  }
}
