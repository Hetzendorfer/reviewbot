import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { StatusFilter } from './utils'

interface ReviewHistoryHeaderProps {
  status: StatusFilter
  onStatusChange: (value: StatusFilter) => void
}

export function ReviewHistoryHeader({
  status,
  onStatusChange,
}: ReviewHistoryHeaderProps) {
  return (
    <div className='flex items-center justify-between gap-3'>
      <div>
        <h3 className='text-xl font-semibold'>Review History</h3>
        <p className='text-sm text-muted-foreground'>
          Recent review runs with token usage and status.
        </p>
      </div>
      <div className='space-y-2'>
        <label className='text-sm font-medium'>Status</label>
        <Select value={status} onValueChange={(value) => onStatusChange(value as StatusFilter)}>
          <SelectTrigger className='w-40'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All</SelectItem>
            <SelectItem value='completed'>Completed</SelectItem>
            <SelectItem value='failed'>Failed</SelectItem>
            <SelectItem value='pending'>Pending</SelectItem>
            <SelectItem value='processing'>Processing</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
