import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ReviewRequest, ReviewResult } from "../types.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "../prompts.js";
import { parseReviewResponse } from "../../review/parser.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";

  async review(
    request: ReviewRequest,
    apiKey: string,
    model: string
  ): Promise<ReviewResult> {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(
            request.prTitle,
            request.diff,
            request.customInstructions
          ),
        },
      ],
      temperature: 0.1,
    });

    const content =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const parsed = parseReviewResponse(content);

    return {
      ...parsed,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
    };
  }
}
