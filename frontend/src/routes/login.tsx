import { createRoute, redirect } from '@tanstack/react-router'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import LoginView from '@/components/LoginView'
import { rootRoute } from './__root'

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: ({ context }) => {
    if (!context.loading && context.user) {
      throw redirect({ to: '/' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const { loading, user, login } = loginRoute.useRouteContext()

  if (loading) {
    return (
      <main className='mx-auto max-w-3xl px-4 py-8'>
        <Card className='border-border/60'>
          <CardHeader className='space-y-3'>
            <Skeleton className='h-6 w-48' />
            <Skeleton className='h-4 w-72' />
          </CardHeader>
          <CardContent className='space-y-3'>
            <Skeleton className='h-11 w-1/2' />
          </CardContent>
        </Card>
      </main>
    )
  }

  if (user) {
    return null
  }

  return <LoginView onLogin={login} />
}
