import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { LlmProvider } from '@/types'
import { MODELS, PROVIDERS, type RangePreset } from './utils'

interface UsageFiltersProps {
  preset: RangePreset
  from: string
  to: string
  provider: LlmProvider | 'all'
  model: string
  onPresetChange: (value: RangePreset) => void
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  onProviderChange: (value: LlmProvider | 'all') => void
  onModelChange: (value: string) => void
}

export function UsageFilters({
  preset,
  from,
  to,
  provider,
  model,
  onPresetChange,
  onFromChange,
  onToChange,
  onProviderChange,
  onModelChange,
}: UsageFiltersProps) {
  const availableModels = provider === 'all'
    ? []
    : MODELS[provider] ?? []

  return (
    <div className='flex flex-wrap items-end gap-3'>
      <div className='space-y-2'>
        <label className='text-sm font-medium'>Range</label>
        <Select value={preset} onValueChange={(value) => onPresetChange(value as RangePreset)}>
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
        <Input type='date' value={from} onChange={(event) => onFromChange(event.target.value)} />
      </div>

      <div className='space-y-2'>
        <label className='text-sm font-medium'>To</label>
        <Input type='date' value={to} onChange={(event) => onToChange(event.target.value)} />
      </div>

      <div className='space-y-2'>
        <label className='text-sm font-medium'>Provider</label>
        <Select
          value={provider}
          onValueChange={(value) => onProviderChange(value as LlmProvider | 'all')}
        >
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
          onValueChange={onModelChange}
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
  )
}
