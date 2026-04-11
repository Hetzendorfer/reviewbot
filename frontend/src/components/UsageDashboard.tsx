import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { LlmProvider } from '@/types'
import { DailyUsageCard } from './usage-dashboard/DailyUsageCard'
import { UsageDashboardLoadingState } from './usage-dashboard/LoadingState'
import { ProviderBreakdownCard } from './usage-dashboard/ProviderBreakdownCard'
import { SummaryCards } from './usage-dashboard/SummaryCards'
import { UsageFilters } from './usage-dashboard/UsageFilters'
import { createPresetRange, MODELS, type RangePreset } from './usage-dashboard/utils'
import { useUsageStats } from './usage-dashboard/useUsageStats'

interface UsageDashboardProps {
  installationId: number
}

export default function UsageDashboard({ installationId }: UsageDashboardProps) {
  const [preset, setPreset] = useState<RangePreset>('30d')
  const [from, setFrom] = useState(() => createPresetRange('30d').from)
  const [to, setTo] = useState(() => createPresetRange('30d').to)
  const [provider, setProvider] = useState<LlmProvider | 'all'>('all')
  const [model, setModel] = useState('all')

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
  const { stats, loading, error } = useUsageStats(installationId, {
    from,
    to,
    provider,
    model,
  })

  return (
    <section className='space-y-4'>
      <UsageFilters
        preset={preset}
        from={from}
        to={to}
        provider={provider}
        model={model}
        onPresetChange={setPreset}
        onFromChange={setFrom}
        onToChange={setTo}
        onProviderChange={setProvider}
        onModelChange={setModel}
      />

      {loading ? (
        <UsageDashboardLoadingState />
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
          <SummaryCards totals={stats.totals} />
          <ProviderBreakdownCard entries={stats.byProvider} />
          <DailyUsageCard entries={stats.daily} />
        </>
      )}
    </section>
  )
}
