import type { LlmProvider } from '@/types'

export const MODELS: Record<LlmProvider, string[]> = {
  openai: ['gpt-5.4'],
  anthropic: ['claude-sonnet-4-5'],
  gemini: ['gemini-2.5-pro'],
  opencode: ['glm-5', 'kimi-k2.5', 'minimax-m2.5']
}

export function getFallbackLabel(account: string): string {
  return account.slice(0, 2).toUpperCase() || 'RB'
}
