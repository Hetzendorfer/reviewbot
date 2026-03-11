import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { useAuth } from '@/hooks/useAuth'
import './index.css'

const noop = () => { /* placeholder until auth loads */ }

const router = createRouter({
  routeTree,
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
