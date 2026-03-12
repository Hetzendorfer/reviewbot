import { useEffect, useState } from 'react'
import type { LlmProvider, Settings } from '@/types'
import { MODELS } from './constants'

export type StatusState = {
  type: 'success' | 'error'
  message: string
}

export function useSettingsForm(settings: Settings, installationId: number) {
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

  const updateProvider = (nextProvider: LlmProvider) => {
    setProvider(nextProvider)
    setModel(MODELS[nextProvider]?.[0] ?? '')
  }

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

  return {
    apiKey,
    customInstructions,
    enabled,
    hasApiKey,
    ignorePaths,
    maxFiles,
    model,
    provider,
    reviewStyle,
    saving,
    status,
    save,
    setApiKey,
    setCustomInstructions,
    setEnabled,
    setIgnorePaths,
    setMaxFiles,
    setModel,
    setReviewStyle,
    updateProvider,
  }
}
