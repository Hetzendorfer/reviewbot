import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { TokenStats } from '@/types'
import { formatNumber, formatUsd } from './utils'

interface DailyUsageCardProps {
  entries: TokenStats['daily']
}

export function DailyUsageCard({ entries }: DailyUsageCardProps) {
  const chartMax = Math.max(
    ...entries.map((entry) => entry.promptTokens + entry.completionTokens),
    0
  )

  return (
    <Card className='border-border/60'>
      <CardHeader>
        <CardTitle>Daily Usage</CardTitle>
        <CardDescription>UTC daily trend for tokens and estimated spend.</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No daily data in this range.</p>
        ) : (
          <div className='space-y-4'>
            <div className='flex h-56 items-end gap-2 overflow-x-auto rounded-lg border border-border/50 bg-secondary/20 p-4'>
              {entries.map((entry) => {
                const totalTokens = entry.promptTokens + entry.completionTokens
                const height = chartMax > 0 ? Math.max((totalTokens / chartMax) * 100, 6) : 6

                return (
                  <div key={entry.date} className='flex min-w-[48px] flex-1 flex-col items-center gap-2'>
                    <div className='text-[11px] text-muted-foreground'>
                      {formatNumber(totalTokens)}
                    </div>
                    <div className='flex h-40 w-full items-end rounded-md bg-background/70 p-1'>
                      <div
                        className='w-full rounded-sm bg-primary transition-all'
                        style={{ height: `${height}%` }}
                        title={`${entry.date}: ${formatNumber(totalTokens)} tokens`}
                      />
                    </div>
                    <div className='text-[10px] text-muted-foreground'>
                      {entry.date.slice(5)}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className='grid gap-3 md:grid-cols-3'>
              {entries.slice(-3).map((entry) => (
                <div key={entry.date} className='rounded-lg border border-border/50 p-3 text-sm'>
                  <div className='font-medium'>{entry.date}</div>
                  <div className='mt-1 text-muted-foreground'>
                    {formatNumber(entry.promptTokens + entry.completionTokens)} tokens
                  </div>
                  <div className='text-muted-foreground'>
                    {formatUsd(entry.estimatedCostUsd)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
