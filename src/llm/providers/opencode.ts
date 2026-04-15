import type { LLMProvider, ReviewRequest, ReviewResult } from "../types.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "../prompts.js";
import { buildReviewResult } from "./shared.js";
import { generateOpenCodeText } from "./opencode-client.js";

export class OpenCodeProvider implements LLMProvider {
  readonly name = "opencode";

  async review(
    request: ReviewRequest,
    apiKey: string,
    model: string
  ): Promise<ReviewResult> {
    const response = await generateOpenCodeText(
      apiKey,
      model,
      SYSTEM_PROMPT,
      buildUserPrompt(
        request.prTitle,
        request.diff,
        request.customInstructions
      ),
      0.1
    );

    return buildReviewResult(response.text, response.usage);
  }
}
