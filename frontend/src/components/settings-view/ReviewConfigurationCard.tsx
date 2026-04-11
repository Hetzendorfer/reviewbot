import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Settings } from '@/types'

interface ReviewConfigurationCardProps {
  reviewStyle: Settings['reviewStyle']
  maxFiles: number
  ignorePaths: string
  onReviewStyleChange: (value: Settings['reviewStyle']) => void
  onMaxFilesChange: (value: number) => void
  onIgnorePathsChange: (value: string) => void
}

export function ReviewConfigurationCard({
  reviewStyle,
  maxFiles,
  ignorePaths,
  onReviewStyleChange,
  onMaxFilesChange,
  onIgnorePathsChange,
}: ReviewConfigurationCardProps) {
  return (
    <Card className='border-border/60'>
      <CardHeader>
        <CardTitle>Review Configuration</CardTitle>
        <CardDescription>Configure how reviews are performed.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='space-y-2'>
          <label htmlFor='reviewStyle' className='text-sm font-medium'>
            Review Style
          </label>
          <Select
            value={reviewStyle}
            onValueChange={(value) => onReviewStyleChange(value as Settings['reviewStyle'])}
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
              onMaxFilesChange(Number.isFinite(parsed) ? parsed : 20)
            }}
          />
        </div>

        <div className='space-y-2'>
          <label htmlFor='ignorePaths' className='text-sm font-medium'>
            Ignore Paths (comma-separated globs)
          </label>
          <Input
            id='ignorePaths'
            value={ignorePaths}
            onChange={(event) => onIgnorePathsChange(event.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  )
}
