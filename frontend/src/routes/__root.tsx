import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { User } from '@/types'

export interface RouterContext {
  user: User | null
  loading: boolean
  login: () => void
  logout: () => Promise<void>
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  return <Outlet />
}
