import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface LoginViewProps {
  onLogin: () => void
}

export default function LoginView({ onLogin }: LoginViewProps) {
  return (
    <main className='mx-auto flex min-h-screen max-w-4xl items-center px-4 py-8'>
      <Card className='w-full border-border/60'>
        <CardHeader className='space-y-2'>
          <CardTitle className='text-3xl'>ReviewBot</CardTitle>
          <CardDescription>AI-powered PR reviews for your repositories</CardDescription>
        </CardHeader>
        <CardContent>
          <Button size='lg' onClick={onLogin}>
            Sign in with GitHub
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
