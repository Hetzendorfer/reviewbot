import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { PaginatedReviews, Review } from '@/types'

interface ReviewHistoryProps {
  installationId: number
}

type StatusFilter = 'all' | 'completed' | 'failed' | 'pending' | 'processing'

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatDuration(value: number | null): string {
  if (value === null) {
    return '—'
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`
  }

  return `${Math.round(value)}ms`
}

function formatTokens(promptTokens: number | null, completionTokens: number | null): string {
  if (promptTokens === null || completionTokens === null) {
    return '—'
  }

  return `${formatNumber(promptTokens)} / ${formatNumber(completionTokens)}`
}

function formatRelativeTime(value: string): string {
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

function getStatusVariant(status: Review['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
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

function LoadingState() {
  return (
    <div className='space-y-3'>
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className='h-12 w-full' />
      ))}
    </div>
  )
}

export default function ReviewHistory({ installationId }: ReviewHistoryProps) {
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<PaginatedReviews | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPage(1)
  }, [status])

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

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <h3 className='text-xl font-semibold'>Review History</h3>
          <p className='text-sm text-muted-foreground'>Recent review runs with token usage and status.</p>
        </div>
        <div className='space-y-2'>
          <label className='text-sm font-medium'>Status</label>
          <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
            <SelectTrigger className='w-40'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All</SelectItem>
              <SelectItem value='completed'>Completed</SelectItem>
              <SelectItem value='failed'>Failed</SelectItem>
              <SelectItem value='pending'>Pending</SelectItem>
              <SelectItem value='processing'>Processing</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className='border-border/60'>
        <CardHeader>
          <CardTitle>Past Reviews</CardTitle>
          <CardDescription>Most recent first, filtered by status when selected.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {loading ? (
            <LoadingState />
          ) : error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : !data || data.reviews.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No reviews found for this installation.</p>
          ) : (
            <>
              <div className='overflow-x-auto'>
                <table className='w-full min-w-[980px] text-left text-sm'>
                  <thead className='text-muted-foreground'>
                    <tr className='border-b'>
                      <th className='py-3 font-medium'>Repository</th>
                      <th className='py-3 font-medium'>PR</th>
                      <th className='py-3 font-medium'>Provider / Model</th>
                      <th className='py-3 font-medium'>Tokens</th>
                      <th className='py-3 font-medium'>Comments</th>
                      <th className='py-3 font-medium'>Status</th>
                      <th className='py-3 font-medium'>Duration</th>
                      <th className='py-3 font-medium'>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reviews.map((review) => (
                      <tr key={review.id} className='border-b border-border/50 align-top'>
                        <td className='py-3 font-medium'>{review.repoFullName}</td>
                        <td className='py-3'>
                          <a
                            href={`https://github.com/${review.repoFullName}/pull/${review.prNumber}`}
                            className='font-medium underline-offset-4 hover:underline'
                            target='_blank'
                            rel='noreferrer'
                          >
                            #{review.prNumber}
                          </a>
                          <div className='mt-1 max-w-xs text-muted-foreground'>{review.prTitle}</div>
                        </td>
                        <td className='py-3'>
                          <Badge variant='secondary' className='mr-2 capitalize'>
                            {review.llmProvider}
                          </Badge>
                          <span className='text-muted-foreground'>{review.llmModel}</span>
                        </td>
                        <td className='py-3'>{formatTokens(review.promptTokens, review.completionTokens)}</td>
                        <td className='py-3'>{formatNumber(review.inlineCommentCount)}</td>
                        <td className='py-3'>
                          <Badge variant={getStatusVariant(review.status)} className='capitalize'>
                            {review.status}
                          </Badge>
                        </td>
                        <td className='py-3'>{formatDuration(review.durationMs)}</td>
                        <td className='py-3'>
                          <div>{formatRelativeTime(review.createdAt)}</div>
                          <div className='text-xs text-muted-foreground'>
                            {new Date(review.createdAt).toLocaleString('en-US')}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className='flex items-center justify-between gap-3'>
                <p className='text-sm text-muted-foreground'>
                  Page {data.pagination.page} of {Math.max(data.pagination.totalPages, 1)} · {formatNumber(data.pagination.total)} total reviews
                </p>
                <div className='flex gap-2'>
                  <Button
                    variant='outline'
                    onClick={() => setPage((current) => Math.max(current - 1, 1))}
                    disabled={data.pagination.page <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant='outline'
                    onClick={() => setPage((current) => current + 1)}
                    disabled={data.pagination.page >= data.pagination.totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
