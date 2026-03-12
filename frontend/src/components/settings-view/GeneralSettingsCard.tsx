import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'

interface GeneralSettingsCardProps {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
}

export function GeneralSettingsCard({
  enabled,
  onEnabledChange,
}: GeneralSettingsCardProps) {
  return (
    <Card className='border-border/60'>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>Enable or disable reviews for this installation.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='flex items-center space-x-2'>
          <Checkbox
            id='enabled'
            checked={enabled}
            onCheckedChange={(checked) => onEnabledChange(checked === true)}
          />
          <label htmlFor='enabled' className='text-sm font-medium leading-none'>
            Enable reviews
          </label>
        </div>
      </CardContent>
    </Card>
  )
}
