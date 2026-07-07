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

// Storage is user- and extension-writable and survives deploys, so every read
// must tolerate corrupt/wrong-shaped values and every write must tolerate a
// quota/security error, rather than throwing out of a render or (worst case) at
// module-evaluation time.
function readIdArray(key: string): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]")
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

// One-time migration: posts liked before SENT_KEY existed must be treated as sent
// so the reconciliation formula does not double-count them.
function migrateSentKey(): void {
  try {
    if (localStorage.getItem("deepscroll_like_sent_v1")) return
    const liked = readIdArray(LIKED_KEY)
    if (liked.length > 0) {
      const merged = Array.from(new Set([...readIdArray(SENT_KEY), ...liked]))
      localStorage.setItem(SENT_KEY, JSON.stringify(merged))
    }
    localStorage.setItem("deepscroll_like_sent_v1", "1")
  } catch {
    // A corrupt or unwritable storage must not crash every page importing this
    // module at load time; skip the migration and let the reads self-heal.
  }
}

if (typeof window !== "undefined") migrateSentKey()

export function getLikedPostIds(): number[] {
  if (typeof window === "undefined") return []
  if (likedCache === null) {
    likedCache = readIdArray(LIKED_KEY)
  }
  return likedCache
}

export function likePost(id: number): void {
  if (typeof window === "undefined") return
  const ids = getLikedPostIds()
  if (!ids.includes(id)) {
    likedCache = [...ids, id]
    safeSet(LIKED_KEY, JSON.stringify(likedCache))
  }
}

export function unlikePost(id: number): void {
  if (typeof window === "undefined") return
  likedCache = getLikedPostIds().filter((x) => x !== id)
  safeSet(LIKED_KEY, JSON.stringify(likedCache))
}

export function isPostLiked(id: number): boolean {
  return getLikedPostIds().includes(id)
}

function getCounts(): Record<string, number> {
  if (countsCache === null) {
    try {
      const parsed = JSON.parse(localStorage.getItem(COUNTS_KEY) ?? "{}")
      countsCache =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, number>)
          : {}
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
    sentCache = readIdArray(SENT_KEY)
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
    safeSet(SENT_KEY, JSON.stringify(sentCache))
  }
}

// Called when the user unlikes before the event has left the in-memory queue.
export function unmarkLikeSent(id: number): void {
  if (typeof window === "undefined") return
  sentCache = getSentIds().filter((x) => x !== id)
  safeSet(SENT_KEY, JSON.stringify(sentCache))
}
