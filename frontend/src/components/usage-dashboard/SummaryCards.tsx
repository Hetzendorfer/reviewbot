import { Card, CardHeader, CardDescription, CardTitle } from '@/components/ui/card'
import type { TokenStats } from '@/types'
import { formatDuration, formatNumber, formatUsd } from './utils'

interface SummaryCardsProps {
  totals: TokenStats['totals']
}

export function SummaryCards({ totals }: SummaryCardsProps) {
  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-5'>
      <Card className='border-border/60'>
        <CardHeader>
          <CardDescription>Total Tokens</CardDescription>
          <CardTitle className='text-2xl'>{formatNumber(totals.totalTokens)}</CardTitle>
        </CardHeader>
      </Card>
      <Card className='border-border/60'>
        <CardHeader>
          <CardDescription>Reviews</CardDescription>
          <CardTitle className='text-2xl'>{formatNumber(totals.reviewCount)}</CardTitle>
        </CardHeader>
      </Card>
      <Card className='border-border/60'>
        <CardHeader>
          <CardDescription>Avg Duration</CardDescription>
          <CardTitle className='text-2xl'>{formatDuration(totals.avgDurationMs)}</CardTitle>
        </CardHeader>
      </Card>
      <Card className='border-border/60'>
        <CardHeader>
          <CardDescription>Failed Reviews</CardDescription>
          <CardTitle className='text-2xl'>{formatNumber(totals.failedCount)}</CardTitle>
        </CardHeader>
      </Card>
      <Card className='border-border/60'>
        <CardHeader>
          <CardDescription>Estimated Cost</CardDescription>
          <CardTitle className='text-2xl'>{formatUsd(totals.estimatedCostUsd)}</CardTitle>
        </CardHeader>
      </Card>
    </div>
  )
}
