import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ReviewHistoryHeader } from './review-history/ReviewHistoryHeader'
import { ReviewHistoryLoadingState } from './review-history/LoadingState'
import { ReviewHistoryTable } from './review-history/ReviewHistoryTable'
import type { StatusFilter } from './review-history/utils'
import { useReviewHistory } from './review-history/useReviewHistory'

interface ReviewHistoryProps {
  installationId: number
}

export default function ReviewHistory({ installationId }: ReviewHistoryProps) {
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [status])
  const { data, loading, error } = useReviewHistory(installationId, page, status)

  return (
    <section className='space-y-4'>
      <ReviewHistoryHeader status={status} onStatusChange={setStatus} />

      {loading ? (
        <ReviewHistoryLoadingState />
      ) : error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : !data ? (
        <Alert>
          <AlertDescription>No review history available.</AlertDescription>
        </Alert>
      ) : (
        <ReviewHistoryTable
          data={data}
          onPreviousPage={() => setPage((current) => Math.max(current - 1, 1))}
          onNextPage={() => setPage((current) => current + 1)}
        />
      )}
    </section>
  )
}
