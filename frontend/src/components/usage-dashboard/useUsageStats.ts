import { useEffect, useState } from 'react'
import type { LlmProvider, TokenStats } from '@/types'

interface UsageStatsFilters {
  from: string
  to: string
  provider: LlmProvider | 'all'
  model: string
}

export function useUsageStats(
  installationId: number,
  { from, to, provider, model }: UsageStatsFilters
) {
  const [stats, setStats] = useState<TokenStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchStats = async () => {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({ from, to })

        if (provider !== 'all') {
          params.set('provider', provider)
        }

        if (model !== 'all') {
          params.set('model', model)
        }

        const res = await fetch(`/api/installations/${installationId}/stats?${params}`)
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          throw new Error(data.error ?? 'Failed to load usage data.')
        }

        const data = (await res.json()) as TokenStats
        if (!cancelled) {
          setStats(data)
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load usage data.'
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    if (from && to) {
      void fetchStats()
    }

    return () => {
      cancelled = true
    }
  }, [from, installationId, model, provider, to])

  return { stats, loading, error }
}
