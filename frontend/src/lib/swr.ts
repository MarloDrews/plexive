import { mutate, type Cache } from "swr"
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
// /api/stats/me or /api/chat/conversations data. revalidate is true so a key
// that is still mounted at the transition (an open feed or profile) refetches
// under the new account right away, instead of sitting on the emptied cache
// until some later trigger.
export function clearApiCache(): void {
  mutate(() => true, undefined, { revalidate: true })
}

// Feed lists revalidate again (the per-session seed pinned the For You order,
// see app/page.tsx), but a revisit still renders the cached list first, so
// in-session mutations remain the cache's responsibility:

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

// Find a post inside the cached feed lists (all /api/feed* keys). The detail
// page seeds its header from this so a card tap paints instantly; the entry
// is a list-endpoint payload, so its sections are [] and read_next is absent,
// and the full GET /api/posts/{id} still runs. Pass useSWRConfig().cache.
export function findPostInFeedCaches(cache: Cache, postId: number): Post | undefined {
  for (const key of cache.keys()) {
    if (typeof key !== "string" || !key.startsWith("/api/feed")) continue
    const data = cache.get(key)?.data
    if (Array.isArray(data)) {
      const post = (data as Post[]).find((p) => p.id === postId)
      if (post) return post
    }
  }
  return undefined
}
