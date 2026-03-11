import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InstallationCard } from '@/components/InstallationCard'
import type { Installation, User } from '@/types'

interface DashboardViewProps {
  user: User
  installations: Installation[]
  installUrl: string
  onConfigure: (installationId: number) => void
  onLogout: () => void
}

function getFallbackLabel(username: string): string {
  return username.slice(0, 2).toUpperCase() || 'RB'
}

export default function DashboardView({
  user,
  installations,
  installUrl,
  onConfigure,
  onLogout
}: DashboardViewProps) {
  return (
    <main className='mx-auto max-w-5xl px-4 py-8'>
      <header className='mb-8 flex flex-wrap items-center justify-between gap-4'>
        <div>
          <h1 className='text-3xl font-semibold tracking-tight'>ReviewBot</h1>
          <p className='text-sm text-muted-foreground'>Configure repositories and review settings</p>
        </div>
        <div className='flex items-center gap-3'>
          <Avatar className='h-8 w-8'>
            <AvatarImage src={user.avatar} alt={user.username} />
            <AvatarFallback>{getFallbackLabel(user.username)}</AvatarFallback>
          </Avatar>
          <span className='text-sm font-medium'>{user.username}</span>
          <Button variant='secondary' size='sm' onClick={onLogout}>
            Logout
          </Button>
        </div>
      </header>

      <section className='space-y-4'>
        <h2 className='text-xl font-semibold'>Your Installations</h2>
        {installations.length === 0 ? (
          <Card className='border-border/60'>
            <CardHeader>
              <CardTitle>No installations yet</CardTitle>
              <CardDescription>
                Install the app on a repository to get started.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <a href={installUrl}>Install ReviewBot</a>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className='grid gap-3'>
            {installations.map((installation) => (
              <InstallationCard
                key={installation.id}
                installation={installation}
                onConfigure={onConfigure}
              />
            ))}
          </div>
        )}
      </section>

      {installations.length > 0 && (
        <div className='mt-6'>
          <Button asChild variant='outline'>
            <a href={installUrl}>Install on another repository</a>
          </Button>
        </div>
      )}
    </main>
  )
}
