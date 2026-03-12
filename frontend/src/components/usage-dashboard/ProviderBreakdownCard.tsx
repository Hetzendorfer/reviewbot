import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { TokenStats } from '@/types'
import { formatNumber, formatUsd } from './utils'

interface ProviderBreakdownCardProps {
  entries: TokenStats['byProvider']
}

export function ProviderBreakdownCard({ entries }: ProviderBreakdownCardProps) {
  return (
    <Card className='border-border/60'>
      <CardHeader>
        <CardTitle>Provider Breakdown</CardTitle>
        <CardDescription>Usage and estimated spend per provider/model.</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No provider data in this range.</p>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[720px] text-left text-sm'>
              <thead className='text-muted-foreground'>
                <tr className='border-b'>
                  <th className='py-3 font-medium'>Provider</th>
                  <th className='py-3 font-medium'>Model</th>
                  <th className='py-3 font-medium'>Reviews</th>
                  <th className='py-3 font-medium'>Prompt</th>
                  <th className='py-3 font-medium'>Completion</th>
                  <th className='py-3 font-medium'>Estimated Cost</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={`${entry.provider}-${entry.model}`} className='border-b border-border/50'>
                    <td className='py-3'>
                      <Badge variant='secondary'>{entry.provider}</Badge>
                    </td>
                    <td className='py-3 font-medium'>{entry.model}</td>
                    <td className='py-3'>{formatNumber(entry.reviewCount)}</td>
                    <td className='py-3'>{formatNumber(entry.promptTokens)}</td>
                    <td className='py-3'>{formatNumber(entry.completionTokens)}</td>
                    <td className='py-3'>{formatUsd(entry.estimatedCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
