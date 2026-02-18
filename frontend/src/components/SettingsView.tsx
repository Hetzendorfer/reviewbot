import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Installation, LlmProvider, Settings } from '@/types'

const MODELS: Record<LlmProvider, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'],
  gemini: ['gemini-2.0-flash', 'gemini-2.0-pro']
}

type StatusState = {
  type: 'success' | 'error'
  message: string
}

interface SettingsViewProps {
  settings: Settings
  installationId: number
  installation: Installation | null
  onBack: () => void
}

function getFallbackLabel(account: string): string {
  return account.slice(0, 2).toUpperCase() || 'RB'
}

export default function SettingsView({
  settings,
  installationId,
  installation,
  onBack
}: SettingsViewProps) {
  const [provider, setProvider] = useState<LlmProvider>(settings.llmProvider)
  const [model, setModel] = useState(settings.llmModel)
  const [reviewStyle, setReviewStyle] = useState(settings.reviewStyle)
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(settings.hasApiKey)
  const [ignorePaths, setIgnorePaths] = useState(settings.ignorePaths.join(', '))
  const [customInstructions, setCustomInstructions] = useState(settings.customInstructions)
  const [maxFiles, setMaxFiles] = useState(settings.maxFilesPerReview)
  const [enabled, setEnabled] = useState(settings.enabled)
  const [status, setStatus] = useState<StatusState | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setProvider(settings.llmProvider)
    setModel(settings.llmModel)
    setReviewStyle(settings.reviewStyle)
    setApiKey('')
    setHasApiKey(settings.hasApiKey)
    setIgnorePaths(settings.ignorePaths.join(', '))
    setCustomInstructions(settings.customInstructions)
    setMaxFiles(settings.maxFilesPerReview)
    setEnabled(settings.enabled)
    setStatus(null)
  }, [settings])

  useEffect(() => {
    if (!(MODELS[provider] ?? []).includes(model)) {
      setModel(MODELS[provider]?.[0] ?? '')
    }
  }, [provider, model])

  const save = async () => {
    setSaving(true)
    setStatus(null)

    try {
      const res = await fetch(`/api/installations/${installationId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llmProvider: provider,
          llmModel: model,
          reviewStyle,
          ...(apiKey ? { apiKey } : {}),
          ignorePaths: ignorePaths.split(',').map((path) => path.trim()).filter(Boolean),
          customInstructions,
          maxFilesPerReview: maxFiles,
          enabled
        })
      })

      const data = (await res.json()) as { error?: string }
      if (res.ok) {
        setStatus({ type: 'success', message: 'Settings saved.' })
        setApiKey('')
        setHasApiKey(true)
      } else {
        setStatus({ type: 'error', message: data.error ?? 'Failed to save settings.' })
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error while saving settings.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className='mx-auto max-w-3xl px-4 py-8'>
      <Card className='border-border/60'>
        <CardHeader className='space-y-4'>
          <div className='flex flex-wrap items-center gap-3'>
            <Button variant='ghost' onClick={onBack}>
              Back
            </Button>
            <CardTitle>Settings</CardTitle>
            {installation && (
              <div className='ml-auto flex items-center gap-2 rounded-md border px-2 py-1 text-sm text-muted-foreground'>
                <Avatar className='h-5 w-5'>
                  <AvatarImage src={installation.avatar} alt={installation.account} />
                  <AvatarFallback>{getFallbackLabel(installation.account)}</AvatarFallback>
                </Avatar>
                {installation.account}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className='space-y-6'>
          <div className='flex items-center space-x-2'>
            <Checkbox
              id='enabled'
              checked={enabled}
              onCheckedChange={(checked) => setEnabled(checked === true)}
            />
            <label htmlFor='enabled' className='text-sm font-medium leading-none'>
              Enable reviews
            </label>
          </div>

          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <label htmlFor='provider' className='text-sm font-medium'>
                LLM Provider
              </label>
              <Select
                value={provider}
                onValueChange={(value) => {
                  const nextProvider = value as LlmProvider
                  setProvider(nextProvider)
                  setModel(MODELS[nextProvider]?.[0] ?? '')
                }}
              >
                <SelectTrigger id='provider'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='openai'>OpenAI</SelectItem>
                  <SelectItem value='anthropic'>Anthropic</SelectItem>
                  <SelectItem value='gemini'>Google Gemini</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <label htmlFor='model' className='text-sm font-medium'>
                Model
              </label>
              <Select value={model} onValueChange={setModel}>
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
              API Key {hasApiKey && '(already set - leave blank to keep)'}
            </label>
            <Input
              id='apiKey'
              type='password'
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={hasApiKey ? '********' : 'Enter your API key'}
            />
          </div>

          <div className='space-y-2'>
            <label htmlFor='reviewStyle' className='text-sm font-medium'>
              Review Style
            </label>
            <Select
              value={reviewStyle}
              onValueChange={(value) => setReviewStyle(value as Settings['reviewStyle'])}
            >
              <SelectTrigger id='reviewStyle'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='both'>Summary + Inline</SelectItem>
                <SelectItem value='inline'>Inline Only</SelectItem>
                <SelectItem value='summary'>Summary Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <label htmlFor='ignorePaths' className='text-sm font-medium'>
              Ignore Paths (comma-separated globs)
            </label>
            <Input
              id='ignorePaths'
              value={ignorePaths}
              onChange={(event) => setIgnorePaths(event.target.value)}
            />
          </div>

          <div className='space-y-2'>
            <label htmlFor='maxFiles' className='text-sm font-medium'>
              Max Files Per Review
            </label>
            <Input
              id='maxFiles'
              type='number'
              min={1}
              max={100}
              value={maxFiles}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10)
                setMaxFiles(Number.isFinite(parsed) ? parsed : 20)
              }}
            />
          </div>

          <div className='space-y-2'>
            <label htmlFor='instructions' className='text-sm font-medium'>
              Custom Instructions
            </label>
            <Textarea
              id='instructions'
              value={customInstructions}
              onChange={(event) => setCustomInstructions(event.target.value)}
              placeholder='Additional instructions for the reviewer...'
            />
          </div>

          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>

          {status && (
            <Alert variant={status.type === 'error' ? 'destructive' : 'default'}>
              <AlertDescription>{status.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
