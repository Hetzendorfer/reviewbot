import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { LlmProvider, TokenStats } from '@/types'

const PROVIDERS: Array<{ label: string; value: LlmProvider | 'all' }> = [
  { label: 'All Providers', value: 'all' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Gemini', value: 'gemini' }
]

const MODELS: Record<LlmProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'],
  gemini: ['gemini-2.0-flash', 'gemini-2.0-pro']
}

type RangePreset = '7d' | '30d' | '90d' | 'custom'

interface UsageDashboardProps {
  installationId: number
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatDuration(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`
  }

  return `${Math.round(value)}ms`
}

function formatUsd(value: number): string {
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

function createPresetRange(preset: Exclude<RangePreset, 'custom'>): { from: string; to: string } {
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

function LoadingState() {
  return (
    <div className='space-y-4'>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-5'>
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index} className='border-border/60'>
            <CardHeader className='space-y-2'>
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-8 w-28' />
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className='border-border/60'>
        <CardHeader className='space-y-2'>
          <Skeleton className='h-5 w-48' />
          <Skeleton className='h-4 w-72' />
        </CardHeader>
        <CardContent className='space-y-3'>
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className='h-10 w-full' />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export default function UsageDashboard({ installationId }: UsageDashboardProps) {
  const [preset, setPreset] = useState<RangePreset>('30d')
  const [from, setFrom] = useState(() => createPresetRange('30d').from)
  const [to, setTo] = useState(() => createPresetRange('30d').to)
  const [provider, setProvider] = useState<LlmProvider | 'all'>('all')
  const [model, setModel] = useState('all')
  const [stats, setStats] = useState<TokenStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (preset === 'custom') {
      return
    }

    const range = createPresetRange(preset)
    setFrom(range.from)
    setTo(range.to)
  }, [preset])

  useEffect(() => {
    if (provider === 'all') {
      setModel('all')
      return
    }

    if (!MODELS[provider]?.includes(model)) {
      setModel('all')
    }
  }, [model, provider])

  useEffect(() => {
    let cancelled = false

    const fetchStats = async () => {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          from,
          to,
        })

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

  const chartMax = stats
    ? Math.max(...stats.daily.map((entry) => entry.promptTokens + entry.completionTokens), 0)
    : 0

  const availableModels = provider === 'all'
    ? []
    : MODELS[provider] ?? []

  return (
    <section className='space-y-4'>
      <div className='flex flex-wrap items-end gap-3'>
        <div className='space-y-2'>
          <label className='text-sm font-medium'>Range</label>
          <Select value={preset} onValueChange={(value) => setPreset(value as RangePreset)}>
            <SelectTrigger className='w-40'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='7d'>Last 7 days</SelectItem>
              <SelectItem value='30d'>Last 30 days</SelectItem>
              <SelectItem value='90d'>Last 90 days</SelectItem>
              <SelectItem value='custom'>Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <label className='text-sm font-medium'>From</label>
          <Input type='date' value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>

        <div className='space-y-2'>
          <label className='text-sm font-medium'>To</label>
          <Input type='date' value={to} onChange={(event) => setTo(event.target.value)} />
        </div>

        <div className='space-y-2'>
          <label className='text-sm font-medium'>Provider</label>
          <Select value={provider} onValueChange={(value) => setProvider(value as LlmProvider | 'all')}>
            <SelectTrigger className='w-44'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <label className='text-sm font-medium'>Model</label>
          <Select
            value={model}
            onValueChange={setModel}
            disabled={provider === 'all'}
          >
            <SelectTrigger className='w-52'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Models</SelectItem>
              {availableModels.map((modelName) => (
                <SelectItem key={modelName} value={modelName}>
                  {modelName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : !stats ? (
        <Alert>
          <AlertDescription>No usage data available.</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-5'>
            <Card className='border-border/60'>
              <CardHeader>
                <CardDescription>Total Tokens</CardDescription>
                <CardTitle className='text-2xl'>{formatNumber(stats.totals.totalTokens)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className='border-border/60'>
              <CardHeader>
                <CardDescription>Reviews</CardDescription>
                <CardTitle className='text-2xl'>{formatNumber(stats.totals.reviewCount)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className='border-border/60'>
              <CardHeader>
                <CardDescription>Avg Duration</CardDescription>
                <CardTitle className='text-2xl'>{formatDuration(stats.totals.avgDurationMs)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className='border-border/60'>
              <CardHeader>
                <CardDescription>Failed Reviews</CardDescription>
                <CardTitle className='text-2xl'>{formatNumber(stats.totals.failedCount)}</CardTitle>
              </CardHeader>
            </Card>
            <Card className='border-border/60'>
              <CardHeader>
                <CardDescription>Estimated Cost</CardDescription>
                <CardTitle className='text-2xl'>{formatUsd(stats.totals.estimatedCostUsd)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card className='border-border/60'>
            <CardHeader>
              <CardTitle>Provider Breakdown</CardTitle>
              <CardDescription>Usage and estimated spend per provider/model.</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.byProvider.length === 0 ? (
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
                      {stats.byProvider.map((entry) => (
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

          <Card className='border-border/60'>
            <CardHeader>
              <CardTitle>Daily Usage</CardTitle>
              <CardDescription>UTC daily trend for tokens and estimated spend.</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.daily.length === 0 ? (
                <p className='text-sm text-muted-foreground'>No daily data in this range.</p>
              ) : (
                <div className='space-y-4'>
                  <div className='flex h-56 items-end gap-2 overflow-x-auto rounded-lg border border-border/50 bg-secondary/20 p-4'>
                    {stats.daily.map((entry) => {
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
                    {stats.daily.slice(-3).map((entry) => (
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
        </>
      )}
    </section>
  )
}
