import { useEffect, useState, type RefObject } from "react"

// How many cards stay mounted on each side of the active one. 2 keeps the
// snap neighborhood (previous/next card) and the entrance animation intact
// while everything further away is replaced by spacers.
const OVERSCAN = 2

// Windows a full-screen snap feed. Every card in the feed and saved-posts
// scrollers is exactly 100dvh tall, so the active index derives from
// scrollTop / viewport height, and the off-window items collapse into two
// spacers sized in dvh (pure CSS: total scroll height and every card offset
// stay correct even when the dynamic viewport unit changes under mobile
// browser chrome). Scroll restore keeps working because a programmatic
// scrollTop write fires the scroll listener, which re-centers the window.
// Returns the [start, end) slice of the list to actually mount.
export function useWindowedFeed(
  scrollRef: RefObject<HTMLElement | null>,
  count: number
): { start: number; end: number } {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const h = el.clientHeight
      if (h <= 0) return
      const idx = Math.round(el.scrollTop / h)
      setActiveIndex((prev) => (prev === idx ? prev : idx))
    }
    // Pick up an already-restored scroll position (and re-clamp on count
    // changes, e.g. a revalidated feed list).
    onScroll()
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [scrollRef, count])

  const clamped = Math.min(Math.max(activeIndex, 0), Math.max(0, count - 1))
  const start = Math.max(0, clamped - OVERSCAN)
  const end = Math.min(count, clamped + OVERSCAN + 1)
  return { start, end }
}
