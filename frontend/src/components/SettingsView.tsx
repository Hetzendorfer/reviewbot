import ReviewHistory from '@/components/ReviewHistory'
import UsageDashboard from '@/components/UsageDashboard'
import type { Installation, Settings } from '@/types'
import { CustomInstructionsCard } from './settings-view/CustomInstructionsCard'
import { GeneralSettingsCard } from './settings-view/GeneralSettingsCard'
import { LlmConfigurationCard } from './settings-view/LlmConfigurationCard'
import { ReviewConfigurationCard } from './settings-view/ReviewConfigurationCard'
import { SaveBar } from './settings-view/SaveBar'
import { SettingsHeader } from './settings-view/SettingsHeader'
import { useSettingsForm } from './settings-view/useSettingsForm'

interface SettingsViewProps {
  settings: Settings
  installationId: number
  installation: Installation | null
  onBack: () => void
}

export default function SettingsView({
  settings,
  installationId,
  installation,
  onBack
}: SettingsViewProps) {
  const {
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
  } = useSettingsForm(settings, installationId)

  return (
    <main className='mx-auto max-w-6xl space-y-8 px-4 py-8'>
      <SettingsHeader installation={installation} onBack={onBack} />

      <GeneralSettingsCard enabled={enabled} onEnabledChange={setEnabled} />

      <LlmConfigurationCard
        provider={provider}
        model={model}
        apiKey={apiKey}
        hasApiKey={hasApiKey}
        onProviderChange={updateProvider}
        onModelChange={setModel}
        onApiKeyChange={setApiKey}
      />

      <ReviewConfigurationCard
        reviewStyle={reviewStyle}
        maxFiles={maxFiles}
        ignorePaths={ignorePaths}
        onReviewStyleChange={setReviewStyle}
        onMaxFilesChange={setMaxFiles}
        onIgnorePathsChange={setIgnorePaths}
      />

      <CustomInstructionsCard
        customInstructions={customInstructions}
        onCustomInstructionsChange={setCustomInstructions}
      />

      <SaveBar saving={saving} status={status} onSave={save} />

      <section className='space-y-4'>
        <div>
          <h2 className='text-2xl font-semibold'>Usage</h2>
          <p className='text-sm text-muted-foreground'>
            Monitor token consumption, estimated spend, and review throughput.
          </p>
        </div>
        <UsageDashboard installationId={installationId} />
      </section>

      <ReviewHistory installationId={installationId} />
    </main>
  )
}
