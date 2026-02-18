import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import LoginView from '@/components/LoginView'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import type { Installation, Settings, View } from '@/types'

const DashboardView = lazy(() => import('@/components/DashboardView'))
const SettingsView = lazy(() => import('@/components/SettingsView'))

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

export default function App() {
  const { user, loading, login, logout } = useAuth()
  const [view, setView] = useState<View>('loading')
  const [installations, setInstallations] = useState<Installation[]>([])
  const [selectedInstallation, setSelectedInstallation] = useState<number | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [installUrl, setInstallUrl] = useState('')

  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  useEffect(() => {
    if (loading) {
      setView('loading')
      return
    }

    if (!user) {
      setView('login')
      return
    }

    if (view === 'loading' || view === 'login') {
      setView('dashboard')
    }
  }, [loading, user, view])

  const fetchInstallations = useCallback(async () => {
    try {
      const res = await fetch('/api/installations')
      if (!res.ok) {
        return
      }

      const data = (await res.json()) as { installations: Installation[] }
      setInstallations(data.installations ?? [])
    } catch (err) {
      console.error('Failed to fetch installations:', err)
    }
  }, [])

  const fetchInstallUrl = useCallback(async () => {
    try {
      const res = await fetch('/api/installations/install-url')
      if (!res.ok) {
        return
      }

      const data = (await res.json()) as { url: string }
      setInstallUrl(data.url ?? '')
    } catch (err) {
      console.error('Failed to fetch install URL:', err)
    }
  }, [])

  const fetchSettings = useCallback(async (installationId: number) => {
    try {
      const res = await fetch(`/api/installations/${installationId}/settings`)
      if (!res.ok) {
        return
      }

      const data = (await res.json()) as Settings
      setSettings(data)
      setSelectedInstallation(installationId)
      setView('settings')
    } catch (err) {
      console.error('Failed to fetch settings:', err)
    }
  }, [])

  useEffect(() => {
    if (!user || view !== 'dashboard') {
      return
    }

    void fetchInstallations()
    void fetchInstallUrl()
  }, [fetchInstallations, fetchInstallUrl, user, view])

  const handleBackToDashboard = useCallback(() => {
    setSettings(null)
    setSelectedInstallation(null)
    setView('dashboard')
  }, [])

  const handleLogout = useCallback(async () => {
    await logout()
    setSettings(null)
    setSelectedInstallation(null)
    setInstallations([])
    setInstallUrl('')
    setView('login')
  }, [logout])

  const selectedInstallationData = useMemo(() => {
    if (selectedInstallation === null) {
      return null
    }

    return installations.find((installation) => installation.id === selectedInstallation) ?? null
  }, [installations, selectedInstallation])

  if (view === 'loading') {
    return <LoadingView />
  }

  if (view === 'login') {
    return <LoginView onLogin={login} />
  }

  if (view === 'settings' && settings && selectedInstallation !== null) {
    return (
      <Suspense fallback={<LoadingView />}>
        <SettingsView
          key={selectedInstallation}
          settings={settings}
          installationId={selectedInstallation}
          installation={selectedInstallationData}
          onBack={handleBackToDashboard}
        />
      </Suspense>
    )
  }

  if (!user) {
    return <LoadingView />
  }

  return (
    <Suspense fallback={<LoadingView />}>
      <DashboardView
        user={user}
        installations={installations}
        installUrl={installUrl}
        onConfigure={fetchSettings}
        onLogout={() => {
          void handleLogout()
        }}
      />
    </Suspense>
  )
}
