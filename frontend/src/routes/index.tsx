import { createRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import DashboardView from '@/components/DashboardView'
import type { Installation } from '@/types'
import { rootRoute } from './__root'

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: ({ context }) => {
    if (!context.loading && !context.user) {
      throw redirect({ to: '/login' })
    }
  },
  component: DashboardPage,
})

function LoadingView() {
  return (
    <main className='mx-auto max-w-3xl px-4 py-8'>
      <Card className='border-border/60'>
        <CardHeader className='space-y-3'>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-4 w-72' />
        </CardHeader>
        <CardContent className='space-y-3'>
          <Skeleton className='h-11 w-full' />
          <Skeleton className='h-11 w-full' />
          <Skeleton className='h-11 w-1/2' />
        </CardContent>
      </Card>
    </main>
  )
}

function DashboardPage() {
  const { loading, user, logout } = indexRoute.useRouteContext()
  const navigate = useNavigate()
  const [installations, setInstallations] = useState<Installation[]>([])
  const [installUrl, setInstallUrl] = useState('')
  const [loaded, setLoaded] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [instRes, urlRes] = await Promise.all([
        fetch('/api/installations'),
        fetch('/api/installations/install-url'),
      ])

      if (instRes.ok) {
        const data = (await instRes.json()) as { installations: Installation[] }
        setInstallations(data.installations ?? [])
      }

      if (urlRes.ok) {
        const data = (await urlRes.json()) as { url: string }
        setInstallUrl(data.url ?? '')
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (loading || !user) {
      return
    }

    setLoaded(false)
    void fetchData()
  }, [fetchData, loading, user])

  const handleLogout = useCallback(async () => {
    await logout()
    void navigate({ to: '/login' })
  }, [logout, navigate])

  const handleConfigure = useCallback(
    (installationId: number) => {
      void navigate({
        to: '/settings/$installationId',
        params: { installationId: String(installationId) },
      })
    },
    [navigate]
  )

  if (loading || !loaded) {
    return <LoadingView />
  }

  if (!user) {
    return null
  }

  return (
    <DashboardView
      user={user}
      installations={installations}
      installUrl={installUrl}
      onConfigure={handleConfigure}
      onLogout={() => { void handleLogout() }}
    />
  )
}
