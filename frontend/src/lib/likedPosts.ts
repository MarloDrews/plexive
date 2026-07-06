// TODO: replace localStorage with a backend endpoint once user accounts are fully integrated
const LIKED_KEY = "deepscroll_liked"
const COUNTS_KEY = "deepscroll_like_counts"
const SENT_KEY = "deepscroll_like_sent"

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
  try {
    return JSON.parse(localStorage.getItem(LIKED_KEY) ?? "[]") as number[]
  } catch {
    return []
  }
}

export function likePost(id: number): void {
  if (typeof window === "undefined") return
  const ids = getLikedPostIds()
  if (!ids.includes(id)) localStorage.setItem(LIKED_KEY, JSON.stringify([...ids, id]))
}

export function unlikePost(id: number): void {
  if (typeof window === "undefined") return
  localStorage.setItem(LIKED_KEY, JSON.stringify(getLikedPostIds().filter((x) => x !== id)))
}

export function isPostLiked(id: number): boolean {
  return getLikedPostIds().includes(id)
}

export function getCachedLikeCount(id: number): number | null {
  if (typeof window === "undefined") return null
  try {
    const obj = JSON.parse(localStorage.getItem(COUNTS_KEY) ?? "{}") as Record<string, number>
    const val = obj[String(id)]
    return val !== undefined ? val : null
  } catch {
    return null
  }
}

export function setCachedLikeCount(id: number, count: number): void {
  if (typeof window === "undefined") return
  try {
    const obj = JSON.parse(localStorage.getItem(COUNTS_KEY) ?? "{}") as Record<string, number>
    obj[String(id)] = count
    localStorage.setItem(COUNTS_KEY, JSON.stringify(obj))
  } catch {}
}

function getSentIds(): number[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]") as number[]
  } catch {
    return []
  }
}

// Whether a "like" event for this post was ever queued and sent to the backend.
export function isLikeSent(id: number): boolean {
  return getSentIds().includes(id)
}

export function markLikeSent(id: number): void {
  if (typeof window === "undefined") return
  const ids = getSentIds()
  if (!ids.includes(id)) localStorage.setItem(SENT_KEY, JSON.stringify([...ids, id]))
}

// Called when the user unlikes before the event has left the in-memory queue.
export function unmarkLikeSent(id: number): void {
  if (typeof window === "undefined") return
  localStorage.setItem(SENT_KEY, JSON.stringify(getSentIds().filter((x) => x !== id)))
}
