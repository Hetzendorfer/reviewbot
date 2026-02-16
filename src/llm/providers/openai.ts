import OpenAI from "openai";
import type { LLMProvider, ReviewRequest, ReviewResult } from "../types.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "../prompts.js";
import { parseReviewResponse } from "../../review/parser.js";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";

  async review(
    request: ReviewRequest,
    apiKey: string,
    model: string
  ): Promise<ReviewResult> {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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

    const content = response.choices[0]?.message?.content ?? "";
    const parsed = parseReviewResponse(content);

    return {
      ...parsed,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }
}
