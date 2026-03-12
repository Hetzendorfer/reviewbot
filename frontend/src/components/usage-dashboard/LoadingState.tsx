import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function UsageDashboardLoadingState() {
  return (
    <div className='space-y-4'>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-5'>
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index} className='border-border/60'>
            <CardHeader className='space-y-2'>
              <Skeleton className='h-4 w-24' />
              <Skeleton className='h-8 w-28' />
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className='border-border/60'>
        <CardHeader className='space-y-2'>
          <Skeleton className='h-5 w-48' />
          <Skeleton className='h-4 w-72' />
        </CardHeader>
        <CardContent className='space-y-3'>
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className='h-10 w-full' />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
