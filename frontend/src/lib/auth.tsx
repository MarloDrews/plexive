"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { clearApiCache } from "./swr"
import { TOKEN_KEY } from "@/lib/storage"

const API_URL = process.env.NEXT_PUBLIC_API_URL

export interface AuthUser {
  id: number
  email: string
  username: string
  created_at: string
  is_verified: number
  is_private: boolean
  bio: string | null
  avatar_url: string | null
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string) => Promise<void>
  logout: () => void
  updateUser: (user: AuthUser) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

// Synchronous token presence check for gating auth-dependent fetches. The
// gated requests only need the Bearer token (already in localStorage), not the
// /me response, so they can fire without waiting for the session restore round
// trip. AuthProvider still validates the token via /me and clears it if
// invalid, which flips user to null and re-renders the gated components.
export function hasToken(): boolean {
  return typeof window !== "undefined" && !!localStorage.getItem(TOKEN_KEY)
}

// FastAPI returns detail as a string for HTTPException but as an array of
// objects for 422 validation errors; both must become a readable message.
function detailToMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) {
    const first = detail[0]
    if (first && typeof first.msg === "string") return first.msg.replace(/^Value error, /, "")
  }
  return fallback
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // On mount, check if there is a stored token and restore the session.
  // If the token is expired or invalid, clear it silently.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setLoading(false)
      return
    }
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("token invalid")
        return r.json() as Promise<AuthUser>
      })
      .then((data) => setUser(data))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false))
  }, [])

  // The actions are useCallback-stable and the context value is memoized on
  // [user, loading]: an inline value object gave every consumer a fresh
  // identity per provider render and invalidated any effect listing these
  // functions as deps.
  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const r = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(detailToMessage(data.detail, "Login failed."))
    // Drop all cached API data so nothing from a previous account survives.
    clearApiCache()
    localStorage.setItem(TOKEN_KEY, data.access_token)
    setUser(data.user as AuthUser)
  }, [])

  const register = useCallback(async (email: string, username: string, password: string): Promise<void> => {
    const r = await fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(detailToMessage(data.detail, "Registration failed."))
    clearApiCache()
    localStorage.setItem(TOKEN_KEY, data.access_token)
    setUser(data.user as AuthUser)
  }, [])

  const logout = useCallback((): void => {
    clearApiCache()
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }, [])

  const updateUser = useCallback((updated: AuthUser): void => {
    setUser(updated)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout, updateUser }),
    [user, loading, login, register, logout, updateUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
