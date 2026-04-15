import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter, useRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { useAuth } from '@/hooks/useAuth'
import './index.css'

const noop = () => { /* placeholder until auth loads */ }

function RedirectToLogin() {
  const router = useRouter()

  React.useEffect(() => {
    void router.navigate({ to: '/login', replace: true })
  }, [router])

  return null
}

const router = createRouter({
  routeTree,
  defaultNotFoundComponent: RedirectToLogin,
  context: {
    user: null,
    loading: true,
    login: noop,
    logout: () => Promise.resolve(),
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  const auth = useAuth()

  React.useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  React.useEffect(() => {
    void router.invalidate()
  }, [auth.loading, auth.user])

  return (
    <RouterProvider
      router={router}
      context={{
        user: auth.user,
        loading: auth.loading,
        login: auth.login,
        logout: auth.logout,
      }}
    />
  )
}

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
