import { Skeleton } from '@/components/ui/skeleton'

export function ReviewHistoryLoadingState() {
  return (
    <div className='space-y-3'>
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className='h-12 w-full' />
      ))}
    </div>
  )
}
