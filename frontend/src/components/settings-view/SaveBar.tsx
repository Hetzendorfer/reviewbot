import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { StatusState } from './useSettingsForm'

interface SaveBarProps {
  saving: boolean
  status: StatusState | null
  onSave: () => void
}

export function SaveBar({ saving, status, onSave }: SaveBarProps) {
  return (
    <div className='flex items-center gap-4'>
      <Button onClick={onSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Settings'}
      </Button>

      {status && (
        <Alert
          variant={status.type === 'error' ? 'destructive' : 'default'}
          className='flex-1'
        >
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
