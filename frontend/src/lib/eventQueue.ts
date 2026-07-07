import { TOKEN_KEY } from "@/lib/storage"

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface QueuedEvent {
  post_id: number
  event_type: "view" | "like"
  duration_ms?: number
}

const queue: QueuedEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null

const BATCH_SIZE = 5
const FLUSH_INTERVAL_MS = 5000

function flush() {
  if (queue.length === 0) return
  if (timer) { clearTimeout(timer); timer = null }
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
  }).catch(() => {})
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
