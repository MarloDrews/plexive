"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { clearApiCache } from "./swr"
import { apiFetch } from "@/lib/api"
import { API_URL, INTERESTS_KEY, TOKEN_KEY, recallInterestsForUser } from "@/lib/storage"
import { detailToMessage } from "@/lib/errorMessage"
import { clearLikeStorage } from "@/lib/likedPosts"
import { clearSavedStorage } from "@/lib/savedPosts"

// Remove this device's per-account local data (interests, saved, liked and the
// like-reconciliation keys) on any account transition, so one account never
// inherits another's Saved/Liked tabs or gets bounced past onboarding. Mirrors
// clearApiCache, which does the same for the SWR cache.
function clearAccountData(): void {
  try {
    localStorage.removeItem(INTERESTS_KEY)
  } catch {}
  clearLikeStorage()
  clearSavedStorage()
}

// After an account transition wiped the active interests, restore the ones this
// specific account picked earlier on this device (if any) so a returning user
// skips onboarding. A brand-new account (just registered, or a first Google
// sign-in) has none remembered, so the topic picker still runs for it exactly
// once -- at account creation.
function restoreAccountInterests(userId: number): void {
  const slugs = recallInterestsForUser(userId)
  if (!slugs) return
  try {
    localStorage.setItem(INTERESTS_KEY, JSON.stringify(slugs))
  } catch {}
}

export interface AuthUser {
  id: number
  email: string
  username: string
  created_at: string
  is_verified: number
  is_private: boolean
  bio: string | null
  avatar_url: string | null
  // Cosmetic accessory ids (lib/accessories). Set by hand in the DB for now --
  // no UI writes them, so nothing here updates them either.
  avatar_frame_id: number | null
  badge_id: number | null
  // True when a Google account is connected. Drives the "Connected" vs
  // "Connect Google" state in profile settings.
  has_google: boolean
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string) => Promise<void>
  // Sign in (or auto-register) with a Google ID token. The token comes from
  // Google Identity Services in GoogleSignInButton.
  googleLogin: (credential: string) => Promise<void>
  // Connect a Google account to the already-logged-in user (profile settings).
  // Unlike googleLogin, it does not switch accounts -- it links Google to this
  // one so both sign-in methods reach the same account.
  linkGoogle: (credential: string) => Promise<void>
  logout: () => void
  updateUser: (user: AuthUser) => void
  // Persist a re-minted token for the current session (e.g. after a password
  // change bumps the token version server-side and invalidates the old token).
  applyFreshToken: (token: string) => void
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

// Parse a JSON body defensively: a proxy 502/504 returns an HTML error page,
// so r.json() throws "Unexpected token '<'"; fall back to an empty object so
// the caller shows a clean message instead of the raw SyntaxError.
async function safeJson(r: Response): Promise<Record<string, unknown>> {
  try {
    return (await r.json()) as Record<string, unknown>
  } catch {
    return {}
  }
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
        if (r.ok) return r.json() as Promise<AuthUser>
        // Only a real 401/403 means the token is bad -- drop it. Any other
        // status (a 5xx during a deploy) keeps the token so a transient backend
        // blip does not log the whole userbase out of open tabs.
        if (r.status === 401 || r.status === 403) {
          try {
            localStorage.removeItem(TOKEN_KEY)
          } catch {}
        }
        return null
      })
      .then((data) => {
        if (data) setUser(data)
      })
      .catch(() => {
        // Network failure during restore (offline, flaky tunnel): keep the token
        // and stay logged out for this load; it can restore on the next request.
      })
      .finally(() => setLoading(false))
  }, [])

  // Central sign-out signal: apiFetch dispatches "auth:unauthorized" (and has
  // already cleared the token) when an authed call 401s mid-session, e.g. the
  // 30-day JWT expired. Reflect it in the UI so it stops looking logged in.
  useEffect(() => {
    function onUnauthorized() {
      setUser(null)
    }
    window.addEventListener("auth:unauthorized", onUnauthorized)
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized)
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
    const data = await safeJson(r)
    if (!r.ok) throw new Error(detailToMessage(data.detail, "Login failed."))
    // Drop all cached API data and per-account local data so nothing from a
    // previous account survives.
    clearApiCache()
    clearAccountData()
    const loggedIn = data.user as AuthUser
    // Bring back this account's own interests so login does not re-run onboarding.
    restoreAccountInterests(loggedIn.id)
    localStorage.setItem(TOKEN_KEY, data.access_token as string)
    setUser(loggedIn)
  }, [])

  const register = useCallback(async (email: string, username: string, password: string): Promise<void> => {
    const r = await fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    })
    const data = await safeJson(r)
    if (!r.ok) throw new Error(detailToMessage(data.detail, "Registration failed."))
    clearApiCache()
    clearAccountData()
    localStorage.setItem(TOKEN_KEY, data.access_token as string)
    setUser(data.user as AuthUser)
  }, [])

  const googleLogin = useCallback(async (credential: string): Promise<void> => {
    const r = await fetch(`${API_URL}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    })
    const data = await safeJson(r)
    if (!r.ok) throw new Error(detailToMessage(data.detail, "Google sign-in failed."))
    // Same account-transition cleanup as login/register: drop any cached data
    // from a previous account before adopting this one.
    clearApiCache()
    clearAccountData()
    const signedIn = data.user as AuthUser
    // Restore this account's interests (no-op for a first Google sign-in, which
    // is effectively a registration and should still onboard once).
    restoreAccountInterests(signedIn.id)
    localStorage.setItem(TOKEN_KEY, data.access_token as string)
    setUser(signedIn)
  }, [])

  const linkGoogle = useCallback(async (credential: string): Promise<void> => {
    // apiFetch attaches the current session's Bearer token, so the backend links
    // Google to THIS account. No account switch and no cache clear -- it is the
    // same user, just gaining a second sign-in method.
    const r = await apiFetch("/api/auth/google/link", {
      method: "POST",
      body: JSON.stringify({ credential }),
    })
    const data = await safeJson(r)
    if (!r.ok) throw new Error(detailToMessage(data.detail, "Could not connect Google."))
    setUser(data as unknown as AuthUser)
  }, [])

  const logout = useCallback((): void => {
    clearApiCache()
    clearAccountData()
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }, [])

  const updateUser = useCallback((updated: AuthUser): void => {
    setUser(updated)
  }, [])

  const applyFreshToken = useCallback((token: string): void => {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {}
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, googleLogin, linkGoogle, logout, updateUser, applyFreshToken }),
    [user, loading, login, register, googleLogin, linkGoogle, logout, updateUser, applyFreshToken]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
