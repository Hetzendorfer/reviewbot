import type { LLMProvider } from "./types.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { GeminiProvider } from "./providers/gemini.js";

const providers = new Map<string, LLMProvider>([
  ["openai", new OpenAIProvider()],
  ["anthropic", new AnthropicProvider()],
  ["gemini", new GeminiProvider()],
]);

export function getProvider(name: string): LLMProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Unknown LLM provider: ${name}`);
  }
  return provider;
}

export function listProviders(): string[] {
  return Array.from(providers.keys());
}
