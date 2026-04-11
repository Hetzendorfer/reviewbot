import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface CustomInstructionsCardProps {
  customInstructions: string
  onCustomInstructionsChange: (value: string) => void
}

export function CustomInstructionsCard({
  customInstructions,
  onCustomInstructionsChange,
}: CustomInstructionsCardProps) {
  return (
    <Card className='border-border/60'>
      <CardHeader>
        <CardTitle>Custom Instructions</CardTitle>
        <CardDescription>Provide additional guidance to the reviewer.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='space-y-2'>
          <label htmlFor='profile' className='text-sm font-medium text-muted-foreground'>
            Profile
          </label>
          <Select disabled>
            <SelectTrigger id='profile'>
              <SelectValue placeholder='Coming soon' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='_'>Default</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <label htmlFor='instructions' className='text-sm font-medium'>
            Instructions
          </label>
          <Textarea
            id='instructions'
            value={customInstructions}
            onChange={(event) => onCustomInstructionsChange(event.target.value)}
            placeholder='Additional instructions for the reviewer...'
            rows={4}
          />
        </div>
      </CardContent>
    </Card>
  )
}
