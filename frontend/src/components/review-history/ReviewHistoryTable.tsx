import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { PaginatedReviews } from '@/types'
import {
  formatDuration,
  formatNumber,
  formatRelativeTime,
  formatTokens,
  getStatusVariant,
} from './utils'

interface ReviewHistoryTableProps {
  data: PaginatedReviews
  onPreviousPage: () => void
  onNextPage: () => void
}

export function ReviewHistoryTable({
  data,
  onPreviousPage,
  onNextPage,
}: ReviewHistoryTableProps) {
  return (
    <Card className='border-border/60'>
      <CardHeader>
        <CardTitle>Past Reviews</CardTitle>
        <CardDescription>Most recent first, filtered by status when selected.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {data.reviews.length === 0 ? (
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
                      <td className='py-3'>
                        {formatTokens(review.promptTokens, review.completionTokens)}
                      </td>
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
                Page {data.pagination.page} of {Math.max(data.pagination.totalPages, 1)} ·{' '}
                {formatNumber(data.pagination.total)} total reviews
              </p>
              <div className='flex gap-2'>
                <Button
                  variant='outline'
                  onClick={onPreviousPage}
                  disabled={data.pagination.page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant='outline'
                  onClick={onNextPage}
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
  )
}
