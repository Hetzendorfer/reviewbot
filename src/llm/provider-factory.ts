import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { generateText } from "ai";

export type ProviderName = "openai" | "anthropic" | "gemini" | "opencode";
export type TextGenerationModel = Parameters<typeof generateText>[0]["model"];

const VALIDATION_MODELS: Record<ProviderName, string> = {
  openai: "gpt-5.4",
  anthropic: "claude-sonnet-4-5",
  gemini: "gemini-2.5-pro",
  opencode: "glm-5",
};

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
      throw new Error(
        "OpenCode Zen chat/completions models require the dedicated OpenCode client"
      );
  }
}
