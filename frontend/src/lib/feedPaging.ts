import type { Post } from "@/types/post"

// The For You feed's paging decision, extracted from app/page.tsx so it can be
// tested without mounting the component. Nothing here touches React, SWR or
// the network: it is a pure question over the pages already loaded, the card
// the reader is looking at, and whether a request is already in flight.
//
// The feed used to make exactly one request, send no cursor and treat the
// first page as the whole corpus, so the 16 oldest of 66 posts were offered
// zero times across 50 distinct sessions -- and nothing failed, because a feed
// that stopped asking looks exactly like a feed that ran out.
// plexive-docs/research/feed-exhaustion-diagnosis-2026-08-31.md.

// How many cards before the end of the loaded list the next page is requested.
// 3 rather than 0: a fetch that only starts once the reader is already on the
// last card shows them an end for as long as the request takes, which is the
// thing this exists to remove. Cards are exactly 100dvh, so 3 is three swipes
// of headroom -- enough for a slow request, and far short of prefetching a
// page the reader will never reach.
export const PREFETCH_DISTANCE = 3

/**
 * The SWR key for one page of the feed.
 *
 * baseKey is the key for the first page (already carrying interests and the
 * per-session seed), or null when the feed must not fetch at all.
 * previousPage is the page before this one, as SWR's infinite loader supplies
 * it: null for page 0.
 * paginated is false for feeds that page by another mechanism (the Following
 * feed uses before_id, not cursor) and so must stay at one page here.
 *
 * Every page carries baseKey verbatim, which is what keeps the seed identical
 * across a session: the backend resolves a cursor by finding that id in the
 * ranking it has just recomputed, and the ranking is a function of the seed, so
 * a page fetched under a different seed is positioned against a different
 * ranking and the pages duplicate and skip.
 */
export function feedPageKey(
  baseKey: string | null,
  pageIndex: number,
  previousPage: Post[] | null,
  paginated: boolean
): string | null {
  if (baseKey === null) return null
  if (pageIndex === 0) return baseKey
  if (!paginated) return null
  // Pages are fetched in order, so the previous one is always in hand here.
  if (previousPage === null) return null
  // The backend's only end signal (backend/app/routers/feed.py:143-152 returns
  // a bare list, with no flag, no null cursor and no total). A SHORT page is
  // not the end: it means the next page is empty, and asking for it is how the
  // end gets read from the backend rather than guessed at.
  if (previousPage.length === 0) return null
  const cursor = previousPage[previousPage.length - 1].id
  return `${baseKey}${baseKey.includes("?") ? "&" : "?"}cursor=${cursor}`
}

/**
 * Has the backend said the corpus is exhausted? Its only end signal is an
 * empty page, so nothing shorter counts.
 */
export function feedReachedEnd(pages: Post[][] | undefined): boolean {
  if (pages === undefined || pages.length === 0) return false
  return pages[pages.length - 1].length === 0
}

/**
 * Should the next page be requested right now?
 *
 * failed is the one that is easy to get wrong: a page request that failed is a
 * failure, not an end. It stops the asking here so a failure cannot become a
 * retry loop -- SWR's own error retry brings the page back -- and the caller
 * must keep rendering the cards it has rather than an "end of feed" screen.
 */
export function shouldLoadNextPage(state: {
  activeIndex: number
  loadedCount: number
  requestInFlight: boolean
  reachedEnd: boolean
  failed: boolean
}): boolean {
  if (state.reachedEnd || state.failed || state.requestInFlight) return false
  if (state.loadedCount <= 0) return false
  return state.activeIndex >= state.loadedCount - PREFETCH_DISTANCE
}
