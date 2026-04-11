import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { Installation } from '@/types'
import { getFallbackLabel } from './constants'

interface SettingsHeaderProps {
  installation: Installation | null
  onBack: () => void
}

export function SettingsHeader({ installation, onBack }: SettingsHeaderProps) {
  return (
    <header className='flex flex-wrap items-center gap-3'>
      <Button variant='ghost' onClick={onBack}>
        Back
      </Button>
      <h1 className='text-2xl font-semibold'>Settings</h1>
      {installation && (
        <div className='ml-auto flex items-center gap-2 rounded-md border px-2 py-1 text-sm text-muted-foreground'>
          <Avatar className='h-5 w-5'>
            <AvatarImage src={installation.avatar} alt={installation.account} />
            <AvatarFallback>{getFallbackLabel(installation.account)}</AvatarFallback>
          </Avatar>
          {installation.account}
        </div>
      )}
    </header>
  )
}
