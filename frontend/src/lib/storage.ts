// Single source for client-side storage keys and the API-to-WebSocket URL
// derivation, both previously duplicated across the auth, api, event-queue and
// socket modules. The token value is kept as-is here (the coordinated rename to
// Plexive is a separate, migration-gated task).
const API_URL = process.env.NEXT_PUBLIC_API_URL

// JWT localStorage key. Read/written by auth, apiFetch, the event queue and the
// chat/battle sockets.
export const TOKEN_KEY = "deepscroll_token"

// http -> ws, https -> wss, appended with the given API path. The backend
// rejects plain ws outside local dev, so production must serve the API over https.
export function wsUrl(path: string): string {
  return (API_URL ?? "").replace(/^http/, "ws") + path
}
