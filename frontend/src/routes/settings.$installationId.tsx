import { createRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import SettingsView from '@/components/SettingsView'
import type { Installation, Settings } from '@/types'
import { rootRoute } from './__root'

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/$installationId',
  beforeLoad: ({ context }) => {
    if (!context.loading && !context.user) {
      throw redirect({ to: '/login' })
    }
  },
  component: SettingsPage,
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

function SettingsPage() {
  const { installationId } = settingsRoute.useParams()
  const { loading, user } = settingsRoute.useRouteContext()
  const navigate = useNavigate()
  const installationIdNum = Number.parseInt(installationId, 10)
  const isValidId = Number.isFinite(installationIdNum) && installationIdNum > 0

  const [settings, setSettings] = useState<Settings | null>(null)
  const [installation, setInstallation] = useState<Installation | null>(null)
  const [error, setError] = useState(!isValidId)

  useEffect(() => {
    if (loading || !user) {
      return
    }

    if (!isValidId) {
      setError(true)
      return
    }

    setError(false)
    setSettings(null)
    setInstallation(null)

    const fetchData = async () => {
      try {
        const [settingsRes, installationsRes] = await Promise.all([
          fetch(`/api/installations/${installationIdNum}/settings`),
          fetch('/api/installations'),
        ])

        if (!settingsRes.ok) {
          setError(true)
          return
        }

        const settingsData = (await settingsRes.json()) as Settings
        setSettings(settingsData)

        if (installationsRes.ok) {
          const instData = (await installationsRes.json()) as { installations: Installation[] }
          const found = instData.installations?.find((i) => i.id === installationIdNum) ?? null
          setInstallation(found)
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err)
        setError(true)
      }
    }

    void fetchData()
  }, [installationIdNum, isValidId, loading, user])

  const handleBack = useCallback(() => {
    void navigate({ to: '/' })
  }, [navigate])

  if (loading) {
    return <LoadingView />
  }

  if (!user) {
    return null
  }

  if (error) {
    return (
      <main className='mx-auto max-w-3xl px-4 py-8'>
        <Card className='border-border/60'>
          <CardContent className='p-6 text-center text-muted-foreground'>
            Failed to load settings. The installation may not exist.
          </CardContent>
        </Card>
      </main>
    )
  }

  if (!settings) {
    return <LoadingView />
  }

  return (
    <SettingsView
      key={installationIdNum}
      settings={settings}
      installationId={installationIdNum}
      installation={installation}
      onBack={handleBack}
    />
  )
}
