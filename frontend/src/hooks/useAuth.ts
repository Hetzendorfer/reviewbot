import { useCallback, useEffect, useState } from 'react'
import type { User } from '@/types'

interface UseAuthResult {
  user: User | null
  loading: boolean
  login: () => void
  logout: () => Promise<void>
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (!res.ok) {
        setUser(null)
        return
      }

      const data = (await res.json()) as User
      setUser(data)
    } catch (err) {
      console.error('Failed to check auth state:', err)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void checkAuth()
  }, [checkAuth])

  const login = useCallback(() => {
    window.location.href = '/api/auth/github'
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (err) {
      console.error('Failed to logout:', err)
    } finally {
      setUser(null)
    }
  }, [])

  return { user, loading, login, logout }
}
