import { useEffect, useState } from 'react'
import type { PaginatedReviews } from '@/types'
import type { StatusFilter } from './utils'

export function useReviewHistory(
  installationId: number,
  page: number,
  status: StatusFilter
) {
  const [data, setData] = useState<PaginatedReviews | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchReviews = async () => {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: '20',
          status,
        })

        const res = await fetch(`/api/installations/${installationId}/reviews?${params}`)
        if (!res.ok) {
          const response = (await res.json()) as { error?: string }
          throw new Error(response.error ?? 'Failed to load review history.')
        }

        const response = (await res.json()) as PaginatedReviews
        if (!cancelled) {
          setData(response)
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load review history.'
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchReviews()

    return () => {
      cancelled = true
    }
  }, [installationId, page, status])

  return { data, loading, error }
}
