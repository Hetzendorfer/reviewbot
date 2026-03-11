import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Installation } from '@/types'

interface InstallationCardProps {
  installation: Installation
  onConfigure: (installationId: number) => void
}

function getFallbackLabel(account: string): string {
  return account.slice(0, 2).toUpperCase() || 'RB'
}

export const InstallationCard = memo(function InstallationCard({
  installation,
  onConfigure
}: InstallationCardProps) {
  return (
    <Card className='border-border/60 transition-colors hover:border-border'>
      <CardContent className='flex items-center gap-4 p-4'>
        <Avatar className='h-12 w-12'>
          <AvatarImage src={installation.avatar} alt={installation.account} />
          <AvatarFallback>{getFallbackLabel(installation.account)}</AvatarFallback>
        </Avatar>

        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <p className='truncate text-sm font-semibold'>{installation.account}</p>
            <Badge variant='secondary'>{installation.type}</Badge>
          </div>
          <p className='text-xs text-muted-foreground'>
            Repository selection: {installation.selection}
          </p>
        </div>

        <Button variant='secondary' onClick={() => onConfigure(installation.id)}>
          Configure
        </Button>
      </CardContent>
    </Card>
  )
})
