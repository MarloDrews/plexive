import { mutate } from "swr"
import { apiFetch } from "./api"
import type { Post } from "@/types/post"

// Error type for non-2xx responses so callers can branch on status
// (e.g. 404 -> "Profile not found") the same way they did with res.ok.
export class ApiError extends Error {
  status: number
  constructor(status: number) {
    super(`API error ${status}`)
    this.status = status
  }
}

// Shared SWR fetcher: same auth behavior as direct apiFetch calls
// (Authorization header attached when a token is in localStorage).
export async function jsonFetcher<T>(path: string): Promise<T> {
  const r = await apiFetch(path)
  if (!r.ok) throw new ApiError(r.status)
  return r.json() as Promise<T>
}

// Clear every cached key. Called on login/register/logout so a different
// account can never see the previous account's cached /api/feed/following,
// /api/stats/me or /api/chat/conversations data. Public data simply refetches.
export function clearApiCache(): void {
  mutate(() => true, undefined, { revalidate: false })
}

// The feed tabs are served cache-first within a session (no background
// revalidate: the backend jitters feed order per request, and a silent
// reshuffle under the user is worse than slightly stale data). That makes
// in-session mutations the cache's responsibility:

// Patch one post inside every cached feed list (all /api/feed* keys).
// Used to keep comment counts on feed cards in sync after commenting.
export function updatePostInFeedCaches(postId: number, patch: Partial<Post>): void {
  mutate<Post[]>(
    (key) => typeof key === "string" && key.startsWith("/api/feed"),
    (data) =>
      Array.isArray(data) ? data.map((p) => (p.id === postId ? { ...p, ...patch } : p)) : data,
    { revalidate: false }
  )
}

// Drop all cached feed lists so the next feed visit fetches fresh.
// Called after creating a post, which can add a new entry to the feed.
export function invalidateFeedCaches(): void {
  mutate((key) => typeof key === "string" && key.startsWith("/api/feed"), undefined, {
    revalidate: false,
  })
}
