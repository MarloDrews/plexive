import { TOKEN_KEY } from "@/lib/storage"
import { markLikeSent, unmarkLikeSent } from "@/lib/likedPosts"

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface QueuedEvent {
  post_id: number
  event_type: "view" | "like" | "unlike"
  duration_ms?: number
  // How many flush attempts this event has survived; bounds retry growth.
  _retries?: number
}

const queue: QueuedEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null

const BATCH_SIZE = 5
const FLUSH_INTERVAL_MS = 5000
const MAX_FLUSH_RETRIES = 3

function flush() {
  // Null the (possibly already-fired) timer handle FIRST. Returning on an empty
  // queue before this left the fired handle set, so scheduleFlush's `if (timer)`
  // guard saw it and never scheduled again for the page's lifetime.
  if (timer) { clearTimeout(timer); timer = null }
  if (queue.length === 0) return
  const batch = queue.splice(0)
  // Attach the auth token so the backend can attribute likes/views to the user
  // (enables per-user like dedup and the liked flag on GET /likes).
  const token = localStorage.getItem(TOKEN_KEY)
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`
  fetch(`${API_URL}/api/events`, {
    method: "POST",
    headers,
    body: JSON.stringify(batch),
    keepalive: true,
  })
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status))
      // Confirm delivery of the optimistically-marked likes so the reconcile
      // formula can trust the sent marker.
      for (const e of batch) if (e.event_type === "like") markLikeSent(e.post_id)
    })
    .catch(() => {
      // The batch never landed: unmark its likes (so they are not treated as
      // on-server) and re-queue for a bounded number of attempts, so a transient
      // failure loses neither views nor likes without unbounded growth.
      const retry: QueuedEvent[] = []
      for (const e of batch) {
        if (e.event_type === "like") unmarkLikeSent(e.post_id)
        const attempts = (e._retries ?? 0) + 1
        if (attempts <= MAX_FLUSH_RETRIES) retry.push({ ...e, _retries: attempts })
      }
      if (retry.length) {
        queue.unshift(...retry)
        scheduleFlush()
      }
    })
}

function scheduleFlush() {
  if (timer) return
  timer = setTimeout(flush, FLUSH_INTERVAL_MS)
}

export function hasPendingLike(postId: number): boolean {
  return queue.some((e) => e.event_type === "like" && e.post_id === postId)
}

export function cancelPendingLike(postId: number): void {
  const index = queue.findIndex((e) => e.event_type === "like" && e.post_id === postId)
  if (index !== -1) queue.splice(index, 1)
}

export function queueEvent(event: QueuedEvent) {
  // Safety net: never queue a second like for the same post while one is pending.
  if (event.event_type === "like" && hasPendingLike(event.post_id)) return
  queue.push(event)
  if (queue.length >= BATCH_SIZE) {
    flush()
  } else {
    scheduleFlush()
  }
}

if (typeof window !== "undefined") {
  // visibilitychange is specced on document (it only reached window by
  // bubbling, which some older engines never deliver), and pagehide replaces
  // beforeunload as the termination flush: a beforeunload listener makes the
  // page ineligible for the back/forward cache in Safari and some Chromium
  // configurations, and iOS often skips beforeunload entirely.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush()
  })
  window.addEventListener("pagehide", flush)
}
