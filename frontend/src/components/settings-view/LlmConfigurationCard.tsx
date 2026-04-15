import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { LlmProvider } from '@/types'
import { MODELS } from './constants'

interface LlmConfigurationCardProps {
  provider: LlmProvider
  model: string
  apiKey: string
  hasApiKey: boolean
  requiresProviderApiKey: boolean
  onProviderChange: (provider: LlmProvider) => void
  onModelChange: (model: string) => void
  onApiKeyChange: (value: string) => void
}

export function LlmConfigurationCard({
  provider,
  model,
  apiKey,
  hasApiKey,
  requiresProviderApiKey,
  onProviderChange,
  onModelChange,
  onApiKeyChange,
}: LlmConfigurationCardProps) {
  return (
    <Card className='border-border/60'>
      <CardHeader>
        <CardTitle>LLM Configuration</CardTitle>
        <CardDescription>Choose your AI provider, model, and API key.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <label htmlFor='provider' className='text-sm font-medium'>
              Provider
            </label>
            <Select
              value={provider}
              onValueChange={(value) => onProviderChange(value as LlmProvider)}
            >
              <SelectTrigger id='provider'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='openai'>OpenAI</SelectItem>
                <SelectItem value='anthropic'>Anthropic</SelectItem>
                <SelectItem value='gemini'>Google Gemini</SelectItem>
                <SelectItem value='opencode'>OpenCode Zen</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <label htmlFor='model' className='text-sm font-medium'>
              Model
            </label>
            <Select value={model} onValueChange={onModelChange}>
              <SelectTrigger id='model'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(MODELS[provider] ?? []).map((modelName) => (
                  <SelectItem key={modelName} value={modelName}>
                    {modelName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className='space-y-2'>
          <label htmlFor='apiKey' className='text-sm font-medium'>
            API Key{' '}
            {requiresProviderApiKey
              ? '(required after provider change)'
              : hasApiKey
                ? '(already set - leave blank to keep)'
                : ''}
          </label>
          <Input
            id='apiKey'
            type='password'
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            placeholder={
              requiresProviderApiKey
                ? 'Enter a new API key for this provider'
                : hasApiKey
                  ? '********'
                  : 'Enter your API key'
            }
          />
          {requiresProviderApiKey && (
            <p className='text-sm text-muted-foreground'>
              Stored API keys are provider-specific. Enter a fresh key before saving.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
