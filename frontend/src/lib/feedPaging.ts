import type { Post } from "@/types/post"

// The For You feed's paging decision, extracted from app/page.tsx so it can be
// tested without mounting the component. Nothing here touches React, SWR or
// the network: it is a pure question over the pages already loaded, the card
// the reader is looking at, and whether a request is already in flight.
//
// This file currently states the behaviour the feed HAS, not the behaviour it
// should have: one request, no cursor, the first page treated as the whole
// corpus. See plexive-docs/research/feed-exhaustion-diagnosis-2026-08-31.md.

// How many cards before the end of the loaded list the next page is requested.
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
 */
export function feedPageKey(
  baseKey: string | null,
  pageIndex: number,
  previousPage: Post[] | null,
  paginated: boolean
): string | null {
  if (baseKey === null) return null
  if (pageIndex === 0) return baseKey
  // No client has ever asked for a second page.
  void previousPage
  void paginated
  return null
}

/**
 * Has the backend said the corpus is exhausted? Its only end signal is an
 * empty page (backend/app/routers/feed.py:143-152 returns a bare list).
 */
export function feedReachedEnd(pages: Post[][] | undefined): boolean {
  if (pages === undefined || pages.length === 0) return false
  // The first page is treated as the whole corpus.
  return true
}

/**
 * Should the next page be requested right now?
 */
export function shouldLoadNextPage(state: {
  activeIndex: number
  loadedCount: number
  requestInFlight: boolean
  reachedEnd: boolean
  failed: boolean
}): boolean {
  void state
  return false
}
