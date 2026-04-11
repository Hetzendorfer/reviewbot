import type { LlmProvider } from '@/types'

export const PROVIDERS: Array<{ label: string; value: LlmProvider | 'all' }> = [
  { label: 'All Providers', value: 'all' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Gemini', value: 'gemini' }
]

export const MODELS: Record<LlmProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'],
  gemini: ['gemini-2.0-flash', 'gemini-2.0-pro']
}

export type RangePreset = '7d' | '30d' | '90d' | 'custom'

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatDuration(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`
  }

  return `${Math.round(value)}ms`
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value >= 1 ? 2 : 4,
    maximumFractionDigits: value >= 1 ? 2 : 4,
  }).format(value)
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function createPresetRange(
  preset: Exclude<RangePreset, 'custom'>
): { from: string; to: string } {
  const today = new Date()
  const to = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  ))

  const days = preset === '7d' ? 6 : preset === '30d' ? 29 : 89
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - days)

  return {
    from: toDateInputValue(from),
    to: toDateInputValue(to),
  }
}
