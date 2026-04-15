import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { generateText } from "ai";

export type ProviderName = "openai" | "anthropic" | "gemini" | "opencode";
export type TextGenerationModel = Parameters<typeof generateText>[0]["model"];

const VALIDATION_MODELS: Record<ProviderName, string> = {
  openai: "gpt-5.4",
  anthropic: "claude-sonnet-4-5",
  gemini: "gemini-2.5-pro",
  opencode: "glm-5",
};

const OPENCODE_ZEN_BASE_URL = "https://opencode.ai/zen/v1";

export function isProviderName(name: string): name is ProviderName {
  return name in VALIDATION_MODELS;
}

export function getValidationModelId(provider: ProviderName): string {
  return VALIDATION_MODELS[provider];
}

export function createProviderModel(
  provider: ProviderName,
  apiKey: string,
  modelId: string
): TextGenerationModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(modelId) as TextGenerationModel;
    case "anthropic":
      return createAnthropic({ apiKey })(modelId) as TextGenerationModel;
    case "gemini":
      return createGoogleGenerativeAI({ apiKey })(modelId) as TextGenerationModel;
    case "opencode":
      return createOpenAICompatible({
        name: "opencode",
        apiKey,
        baseURL: OPENCODE_ZEN_BASE_URL,
      })(modelId) as unknown as TextGenerationModel;
  }
}
