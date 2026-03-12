import type { Review } from '@/types'

export type StatusFilter = 'all' | 'completed' | 'failed' | 'pending' | 'processing'

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value).toLowerCase()
}

export function formatDuration(value: number | null): string {
  if (value === null) {
    return '—'
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`
  }

  return `${Math.round(value)}ms`
}

export function formatTokens(
  promptTokens: number | null,
  completionTokens: number | null
): string {
  if (promptTokens === null || completionTokens === null) {
    return '—'
  }

  return `${formatCompactNumber(promptTokens)} / ${formatCompactNumber(completionTokens)}`
}

export function formatRelativeTime(value: string): string {
  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) {
    return 'just now'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) {
    return `${diffDays}d ago`
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function getStatusVariant(
  status: Review['status']
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default'
    case 'failed':
      return 'destructive'
    case 'processing':
      return 'secondary'
    default:
      return 'outline'
  }
}
