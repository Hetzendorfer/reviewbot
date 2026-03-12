import type { LlmProvider } from '@/types'

export const MODELS: Record<LlmProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'],
  gemini: ['gemini-2.0-flash', 'gemini-2.0-pro']
}

export function getFallbackLabel(account: string): string {
  return account.slice(0, 2).toUpperCase() || 'RB'
}
