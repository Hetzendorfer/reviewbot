import { useCallback, useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { InstallationDiagnostics } from '@/types'

interface WebhookDiagnosticsPanelProps {
  installationId: number
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString()
}

export default function WebhookDiagnosticsPanel({
  installationId,
}: WebhookDiagnosticsPanelProps) {
  const [data, setData] = useState<InstallationDiagnostics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/installations/${installationId}/diagnostics`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Failed to load diagnostics' }))
        setError(payload.error ?? 'Failed to load diagnostics')
        setData(null)
        return
      }

      const payload = (await response.json()) as InstallationDiagnostics
      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diagnostics')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [installationId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between gap-4'>
        <div>
          <h2 className='text-2xl font-semibold'>Diagnostics</h2>
          <p className='text-sm text-muted-foreground'>
            Inspect webhook deliveries, queue state, and recent review execution.
          </p>
        </div>
        <Button variant='outline' size='sm' onClick={() => { void load() }}>
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant='destructive'>
          <AlertTitle>Failed to load diagnostics</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && !data ? (
        <Card className='border-border/60'>
          <CardContent className='p-6 text-sm text-muted-foreground'>
            Loading diagnostics...
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <>
          <Card className='border-border/60'>
            <CardHeader>
              <CardTitle>Connection Checklist</CardTitle>
              <CardDescription>
                Use this to confirm your repo, GitHub App, and deployment are wired together.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <div className='flex flex-wrap gap-2'>
                <Badge variant={data.installation.existsLocally ? 'secondary' : 'destructive'}>
                  Local installation: {data.installation.existsLocally ? 'yes' : 'no'}
                </Badge>
                <Badge variant={data.installation.enabled ? 'secondary' : 'destructive'}>
                  Reviews enabled: {data.installation.enabled ? 'yes' : 'no'}
                </Badge>
                <Badge variant={data.installation.hasApiKey ? 'secondary' : 'destructive'}>
                  API key: {data.installation.hasApiKey ? 'configured' : 'missing'}
                </Badge>
              </div>
              <div className='grid gap-2 text-muted-foreground'>
                <p>
                  Trigger phrase: <code>{data.triggerPhrase}</code>
                </p>
                <p>
                  App slug: <code>{data.appSlug}</code>
                </p>
                <p>
                  Webhook endpoint: <code>{data.webhookEndpoint}</code>
                </p>
                <p>
                  Queue state: pending {data.queue.pending}, processing {data.queue.processing}, failed {data.queue.failed}
                </p>
                <p>
                  Current provider/model: <code>{data.installation.provider ?? 'unset'}</code> / <code>{data.installation.model ?? 'unset'}</code>
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className='border-border/60'>
            <CardHeader>
              <CardTitle>Recent Webhook Activity</CardTitle>
              <CardDescription>
                Confirms whether GitHub is reaching this deployment at all.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {data.recentWebhookTraces.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  No recent webhook traffic for this installation.
                </p>
              ) : (
                data.recentWebhookTraces.map((trace) => (
                  <div key={trace.id} className='rounded-lg border border-border/60 p-3 text-sm'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Badge variant={trace.ok ? 'secondary' : 'destructive'}>
                        {trace.stage}
                      </Badge>
                      <span className='text-muted-foreground'>{formatTimestamp(trace.timestamp)}</span>
                      {trace.deliveryId ? <code>{trace.deliveryId}</code> : null}
                    </div>
                    <div className='mt-2 space-y-1 text-muted-foreground'>
                      <p>{trace.repoFullName ?? 'unknown repo'} PR #{trace.prNumber ?? '?'}</p>
                      <p>{trace.event ?? 'unknown event'} / {trace.action ?? 'no action'}</p>
                      {trace.detail ? <p>{trace.detail}</p> : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className='border-border/60'>
            <CardHeader>
              <CardTitle>Recent Jobs</CardTitle>
              <CardDescription>
                Shows queue records persisted by the backend for this installation.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {data.recentJobs.length === 0 ? (
                <p className='text-sm text-muted-foreground'>No review jobs recorded yet.</p>
              ) : (
                data.recentJobs.map((job) => (
                  <div key={job.id} className='rounded-lg border border-border/60 p-3 text-sm'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Badge variant={job.status === 'failed' ? 'destructive' : 'secondary'}>
                        {job.status}
                      </Badge>
                      <span className='text-muted-foreground'>
                        {job.repoFullName} PR #{job.prNumber}
                      </span>
                    </div>
                    <div className='mt-2 space-y-1 text-muted-foreground'>
                      <p>Created: {formatTimestamp(job.createdAt)}</p>
                      {job.startedAt ? <p>Started: {formatTimestamp(job.startedAt)}</p> : null}
                      {job.completedAt ? <p>Completed: {formatTimestamp(job.completedAt)}</p> : null}
                      {job.errorMessage ? <p>Error: {job.errorMessage}</p> : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </section>
  )
}
