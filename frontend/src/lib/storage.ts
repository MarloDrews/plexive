// Single source for client-side storage keys and the API-to-WebSocket URL
// derivation, both previously duplicated across the auth, api, event-queue and
// socket modules. The token value is kept as-is here (the coordinated rename to
// Plexive is a separate, migration-gated task).
// Single source for the API base URL. A missing NEXT_PUBLIC_API_URL used to
// surface as scattered "undefined/api/..." 404s with no obvious cause; instead
// emit one loud diagnostic at load in the browser so a misconfigured build is
// caught immediately rather than debugged symptom by symptom.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ""
if (typeof window !== "undefined" && !API_URL) {
  console.error(
    "NEXT_PUBLIC_API_URL is not set: API requests and WebSocket connections will fail. " +
      "Set it in the frontend build environment."
  )
}

// JWT localStorage key. Read/written by auth, apiFetch, the event queue and the
// chat/battle sockets.
export const TOKEN_KEY = "deepscroll_token"

// Active interests key. Drives the onboarding gate and the feed query, and works
// for anonymous browsing too. Cleared on any account transition (see auth).
export const INTERESTS_KEY = "deepscroll_interests"

// Per-account backup of the picked interests, keyed by user id, so logging back
// into an account that already onboarded on THIS device restores its interests
// instead of forcing the topic picker again. There is no server copy, so a first
// login on a new device still onboards. Shape: { [userId: number]: string[] }.
const INTERESTS_BY_USER_KEY = "deepscroll_interests_by_user"

function readInterestsMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(INTERESTS_BY_USER_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string[]>) : {}
  } catch {
    return {}
  }
}

// Save this account's interests so a later login on this device can restore them.
export function rememberInterestsForUser(userId: number, slugs: string[]): void {
  try {
    const map = readInterestsMap()
    map[userId] = slugs
    localStorage.setItem(INTERESTS_BY_USER_KEY, JSON.stringify(map))
  } catch {}
}

// The remembered interests for this account, or null if it never onboarded here.
export function recallInterestsForUser(userId: number): string[] | null {
  const value = readInterestsMap()[userId]
  return Array.isArray(value) ? value : null
}

// Google OAuth Web client id for "Sign in with Google". Must match the backend's
// GOOGLE_CLIENT_ID. Empty when unset -- GoogleSignInButton then renders nothing,
// so email/password stays the only visible option.
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""

// http -> ws, https -> wss, appended with the given API path. The backend
// rejects plain ws outside local dev, so production must serve the API over https.
export function wsUrl(path: string): string {
  return API_URL.replace(/^http/, "ws") + path
}
