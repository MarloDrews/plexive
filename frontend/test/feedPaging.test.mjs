import { test } from "node:test"
import assert from "node:assert/strict"
// Imported with the .ts extension on purpose (see italics.test.mjs): Node/tsx
// strips the types at load time and keeping the test as .mjs means tsc never
// sees these imports.
import {
  PREFETCH_DISTANCE,
  feedPageKey,
  feedReachedEnd,
  shouldLoadNextPage,
} from "../src/lib/feedPaging.ts"

// The For You feed used to make exactly one request and treat the first page as
// the whole corpus, so 16 of 66 posts were unreachable in every session --
// plexive-docs/research/feed-exhaustion-diagnosis-2026-08-31.md. Nothing failed
// when that happened: a feed that stops asking looks exactly like a feed that
// ran out. These assertions are what makes the next such omission loud.

const BASE = "/api/feed?interests=physics%2Castronomy&seed=482910337"

// The backend returns a bare list of posts; only the id matters here.
const page = (...ids) => ids.map((id) => ({ id }))

// -- feedPageKey ------------------------------------------------------------

test("feedPageKey returns null while the feed must not fetch at all", () => {
  assert.equal(feedPageKey(null, 0, null, true), null)
  assert.equal(feedPageKey(null, 3, page(9), true), null)
})

test("feedPageKey asks for the first page with the base key, unchanged", () => {
  assert.equal(feedPageKey(BASE, 0, null, true), BASE)
})

test("feedPageKey asks for a second page, anchored on the last id of the first", () => {
  // The pre-fix client never sent a cursor at all: grep -rn "cursor" src/
  // returned only CSS. This is the whole defect in one assertion.
  const key = feedPageKey(BASE, 1, page(66, 65, 19), true)
  assert.notEqual(key, null, "the second page must be requested, not treated as the end")
  assert.equal(key, `${BASE}&cursor=19`)
})

test("feedPageKey anchors on the LAST item of the previous page, not the first", () => {
  assert.equal(feedPageKey(BASE, 1, page(50, 40, 30), true), `${BASE}&cursor=30`)
})

test("feedPageKey sends the SAME seed on every page of one session", () => {
  // The backend resolves a cursor by finding that id in the ranking it just
  // recomputed, and the ranking is a function of the seed. A page fetched under
  // a different seed is positioned against a different ranking, which
  // duplicates and skips posts and reads as a backend fault.
  const seedOf = (key) => new URLSearchParams(key.slice(key.indexOf("?") + 1)).get("seed")
  const first = feedPageKey(BASE, 0, null, true)
  const second = feedPageKey(BASE, 1, page(19), true)
  const third = feedPageKey(BASE, 2, page(4), true)
  assert.notEqual(second, null)
  assert.notEqual(third, null)
  assert.equal(seedOf(first), "482910337")
  assert.equal(seedOf(second), "482910337")
  assert.equal(seedOf(third), "482910337")
})

test("feedPageKey stops only on an empty previous page, the backend's one end signal", () => {
  assert.equal(feedPageKey(BASE, 2, page(), true), null)
})

test("feedPageKey does NOT stop on a short page", () => {
  // A page shorter than the limit means the NEXT page is empty, not that this
  // one is the end. The backend says so itself, with an empty page, and that is
  // the only signal read here.
  assert.notEqual(feedPageKey(BASE, 1, page(19), true), null)
})

test("feedPageKey leaves an unpaginated feed at one page", () => {
  // The Following feed pages by before_id, not cursor, and is not touched here.
  assert.equal(feedPageKey("/api/feed/following", 0, null, false), "/api/feed/following")
  assert.equal(feedPageKey("/api/feed/following", 1, page(7), false), null)
})

test("feedPageKey opens the query string when the base key has none", () => {
  assert.equal(feedPageKey("/api/feed", 1, page(12), true), "/api/feed?cursor=12")
})

// -- feedReachedEnd ---------------------------------------------------------

test("feedReachedEnd is false before anything has loaded", () => {
  assert.equal(feedReachedEnd(undefined), false)
  assert.equal(feedReachedEnd([]), false)
})

test("feedReachedEnd is false while the last loaded page still has posts", () => {
  // The pre-fix feed treated the first page as the whole corpus. This is that
  // assumption, stated as the thing that must not be true.
  assert.equal(feedReachedEnd([page(66, 65, 19)]), false)
  assert.equal(feedReachedEnd([page(66, 65), page(19)]), false)
})

test("feedReachedEnd is true once the backend returns an empty page", () => {
  assert.equal(feedReachedEnd([page(66, 65), page(19), page()]), true)
})

// -- shouldLoadNextPage -----------------------------------------------------

const state = (over) => ({
  activeIndex: 0,
  loadedCount: 50,
  requestInFlight: false,
  reachedEnd: false,
  failed: false,
  ...over,
})

test("shouldLoadNextPage asks before the reader is on the last card", () => {
  // A fetch that only starts once the last card is already on screen shows an
  // end for a moment, which is the thing this fix exists to remove.
  assert.ok(PREFETCH_DISTANCE >= 1)
  const trigger = 50 - PREFETCH_DISTANCE
  assert.equal(shouldLoadNextPage(state({ activeIndex: trigger })), true)
  assert.equal(shouldLoadNextPage(state({ activeIndex: trigger - 1 })), false)
})

test("shouldLoadNextPage still asks on the last card", () => {
  assert.equal(shouldLoadNextPage(state({ activeIndex: 49 })), true)
})

test("shouldLoadNextPage does not ask while a request is in flight", () => {
  // Every scroll event inside the trigger zone re-asks; without this one swipe
  // would fire a page request per scroll frame.
  assert.equal(shouldLoadNextPage(state({ activeIndex: 49, requestInFlight: true })), false)
})

test("shouldLoadNextPage does not ask once the corpus is exhausted", () => {
  assert.equal(shouldLoadNextPage(state({ activeIndex: 49, reachedEnd: true })), false)
})

test("shouldLoadNextPage does not ask after a failed page request", () => {
  // A failed request is a failure, not an end: it must not become a retry loop
  // here (SWR's own error retry brings the page back), and the caller must not
  // render it as "nothing more".
  assert.equal(shouldLoadNextPage(state({ activeIndex: 49, failed: true })), false)
})

test("shouldLoadNextPage does not ask before the first page has arrived", () => {
  assert.equal(shouldLoadNextPage(state({ activeIndex: 0, loadedCount: 0 })), false)
})

// -- the two functions driven together, to exhaustion -----------------------

test("paging reaches every eligible post exactly once, then stops", () => {
  // A stand-in for the backend: one stable ranking, cursor-anchored slices,
  // an empty page when the ranking runs out. That is what
  // backend/app/routers/feed.py:143-152 does.
  const ELIGIBLE = 66
  const LIMIT = 50
  const ranking = Array.from({ length: ELIGIBLE }, (_, i) => ELIGIBLE - i)
  const serve = (cursor) => {
    const from = cursor === null ? 0 : ranking.indexOf(cursor) + 1
    return page(...ranking.slice(from, from + LIMIT))
  }

  const pages = []
  let requests = 0
  for (let i = 0; i < 100; i++) {
    const key = feedPageKey(BASE, i, i === 0 ? null : pages[i - 1], true)
    if (key === null) break
    const cursor = new URLSearchParams(key.slice(key.indexOf("?") + 1)).get("cursor")
    pages.push(serve(cursor === null ? null : Number(cursor)))
    requests++
  }

  const delivered = pages.flat().map((p) => p.id)
  const distinct = new Set(delivered)
  assert.equal(requests, 3, "50 + 16 + 0 is three requests")
  assert.deepEqual(
    pages.map((p) => p.length),
    [50, 16, 0]
  )
  assert.equal(delivered.length, ELIGIBLE, "no post delivered twice")
  assert.equal(distinct.size, ELIGIBLE, "no post skipped")
  assert.equal(feedReachedEnd(pages), true)
  assert.equal(shouldLoadNextPage(state({ activeIndex: 65, loadedCount: 66, reachedEnd: true })), false)
})
