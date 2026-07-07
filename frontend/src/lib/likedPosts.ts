// TODO: replace localStorage with a backend endpoint once user accounts are fully integrated
const LIKED_KEY = "deepscroll_liked"
const COUNTS_KEY = "deepscroll_like_counts"
const SENT_KEY = "deepscroll_like_sent"

// Parsed-once caches: with hundreds of mounted cards these blobs used to be
// JSON.parsed from localStorage on every call (several parses per card mount
// plus one per visibility flip). This module is the single write path, so each
// writer refreshes the cache it owns and reads parse at most once per session.
let likedCache: number[] | null = null
let countsCache: Record<string, number> | null = null
let sentCache: number[] | null = null

// One-time migration: posts liked before SENT_KEY existed must be treated as sent
// so the reconciliation formula does not double-count them.
function migrateSentKey(): void {
  if (localStorage.getItem("deepscroll_like_sent_v1")) return
  const liked = JSON.parse(localStorage.getItem(LIKED_KEY) ?? "[]") as number[]
  if (liked.length > 0) {
    const alreadySent = JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]") as number[]
    const merged = Array.from(new Set([...alreadySent, ...liked]))
    localStorage.setItem(SENT_KEY, JSON.stringify(merged))
  }
  localStorage.setItem("deepscroll_like_sent_v1", "1")
}

if (typeof window !== "undefined") migrateSentKey()

export function getLikedPostIds(): number[] {
  if (typeof window === "undefined") return []
  if (likedCache === null) {
    try {
      likedCache = JSON.parse(localStorage.getItem(LIKED_KEY) ?? "[]") as number[]
    } catch {
      likedCache = []
    }
  }
  return likedCache
}

export function likePost(id: number): void {
  if (typeof window === "undefined") return
  const ids = getLikedPostIds()
  if (!ids.includes(id)) {
    likedCache = [...ids, id]
    localStorage.setItem(LIKED_KEY, JSON.stringify(likedCache))
  }
}

export function unlikePost(id: number): void {
  if (typeof window === "undefined") return
  likedCache = getLikedPostIds().filter((x) => x !== id)
  localStorage.setItem(LIKED_KEY, JSON.stringify(likedCache))
}

export function isPostLiked(id: number): boolean {
  return getLikedPostIds().includes(id)
}

function getCounts(): Record<string, number> {
  if (countsCache === null) {
    try {
      countsCache = JSON.parse(localStorage.getItem(COUNTS_KEY) ?? "{}") as Record<string, number>
    } catch {
      countsCache = {}
    }
  }
  return countsCache
}

export function getCachedLikeCount(id: number): number | null {
  if (typeof window === "undefined") return null
  const val = getCounts()[String(id)]
  return val !== undefined ? val : null
}

export function setCachedLikeCount(id: number, count: number): void {
  if (typeof window === "undefined") return
  try {
    const obj = getCounts()
    obj[String(id)] = count
    localStorage.setItem(COUNTS_KEY, JSON.stringify(obj))
  } catch {}
}

function getSentIds(): number[] {
  if (typeof window === "undefined") return []
  if (sentCache === null) {
    try {
      sentCache = JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]") as number[]
    } catch {
      sentCache = []
    }
  }
  return sentCache
}

// Whether a "like" event for this post was ever queued and sent to the backend.
export function isLikeSent(id: number): boolean {
  return getSentIds().includes(id)
}

export function markLikeSent(id: number): void {
  if (typeof window === "undefined") return
  const ids = getSentIds()
  if (!ids.includes(id)) {
    sentCache = [...ids, id]
    localStorage.setItem(SENT_KEY, JSON.stringify(sentCache))
  }
}

// Called when the user unlikes before the event has left the in-memory queue.
export function unmarkLikeSent(id: number): void {
  if (typeof window === "undefined") return
  sentCache = getSentIds().filter((x) => x !== id)
  localStorage.setItem(SENT_KEY, JSON.stringify(sentCache))
}
