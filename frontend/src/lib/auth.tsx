import { createContext, useContext, useMemo, useState } from 'react'

import type { ReactNode } from 'react'

import { TOKEN_KEY } from './api'

export type Role =
  | 'super_admin'
  | 'org_admin'
  | 'agent'
  | 'transporter'
  | 'customer'

export type UserStatus = 'active' | 'locked' | 'banned'

export interface AuthUser {
  id: number
  name: string
  email: string
  role: Role
  wallet_address: string
  organization_id: number | null
  status?: UserStatus
}

export function isAdminRole(role?: Role): boolean {
  return role === 'super_admin' || role === 'org_admin'
}

const USER_KEY = 'chaintrack_user'

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  login: (token: string, user: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const isBrowser = typeof window !== 'undefined'

function readStoredUser(): AuthUser | null {
  if (!isBrowser) return null
  const raw = window.localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [token, setToken] = useState<string | null>(() =>
    isBrowser ? window.localStorage.getItem(TOKEN_KEY) : null,
  )
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser())

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token),
      login: (newToken, newUser) => {
        window.localStorage.setItem(TOKEN_KEY, newToken)
        window.localStorage.setItem(USER_KEY, JSON.stringify(newUser))
        setToken(newToken)
        setUser(newUser)
      },
      logout: () => {
        window.localStorage.removeItem(TOKEN_KEY)
        window.localStorage.removeItem(USER_KEY)
        setToken(null)
        setUser(null)
      },
    }),
    [token, user],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

// RoleGate renders children only when the signed-in user's role is in
// `roles` — reusable in place of scattered `user.role === '...'` checks.
export function RoleGate({
  roles,
  children,
}: Readonly<{ roles: Array<Role>; children: ReactNode }>) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) return null
  return children
}
