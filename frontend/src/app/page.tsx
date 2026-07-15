"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import useSWR from "swr"
import dynamic from "next/dynamic"
import PostCard from "@/components/PostCard"
import BottomNav from "@/components/BottomNav"
import ToastHost from "@/components/ToastHost"
import FeedHeader, { FEED_TABS_ID, type FeedTab } from "@/components/FeedHeader"
import type { Post } from "@/types/post"
import { useAuth, hasToken } from "@/lib/auth"
import { scrollBehavior } from "@/lib/motion"
import { tabPanelProps } from "@/lib/tablist"
import { useSwipeTabs } from "@/lib/useSwipeTabs"
import { useWindowedFeed } from "@/lib/useWindowedFeed"

// Train and Battle ship as their own lazy chunks: their whole import graphs
// (stage kit, sockets, question pools, Elo math) otherwise sit in the entry
// chunk of the app's most-visited route while rendering is already gated on
// tab activation. The loading fallback is the same empty surface the
// non-activated tab shows, so nothing changes visually while the chunk loads.
const Marathon = dynamic(() => import("@/components/Marathon"), {
  ssr: false,
  loading: () => <div className="h-full bg-surface-0" />,
})
const Battle = dynamic(() => import("@/components/Battle"), {
  ssr: false,
  loading: () => <div className="h-full bg-surface-0" />,
})

const TABS: FeedTab[] = [
  // The feed has no format-specific tabs (books, people, etc.); format filtering
  // lives only in the search view now, matching the mobile tab set. These four
  // non-format tabs carry no accent dot; the capsule itself stays neutral.
  // Following sits left of For You, but For You stays the default open tab.
  // Train and Battle sit right of For You (matching the mobile tab order); they
  // host their own components instead of a card feed (see the pager map below).
  { id: "following", label: "Following", format: null, accent: "#eceeff" },
  { id: "for-you", label: "For You", format: null, accent: "#eceeff" },
  { id: "train", label: "Train", format: null, accent: "#eceeff" },
  { id: "battle", label: "Battle", format: null, accent: "#eceeff" },
]

const DEFAULT_TAB_INDEX = TABS.findIndex((t) => t.id === "for-you")

// useLayoutEffect must not run on the server (React warns that it does nothing
// there). The feed only exists on the client, so fall back to useEffect during
// SSR purely to keep that warning out of the console.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

// A per-session feed seed, generated once and reused for the whole session.
// The backend jitters For You order per request but is deterministic under a
// fixed seed, so pinning one seed makes the order stable across refetches --
// which is what lets feed revalidation be turned back on without the feed
// visibly reshuffling under the user.
function getFeedSeed(): string {
  if (typeof window === "undefined") return "0"
  try {
    let s = sessionStorage.getItem("feedSeed")
    if (!s) {
      s = Math.floor(Math.random() * 1_000_000_000).toString()
      sessionStorage.setItem("feedSeed", s)
    }
    return s
  } catch {
    // Private-mode / disabled storage must not crash the feed render.
    return Math.floor(Math.random() * 1_000_000_000).toString()
  }
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] bg-surface-0 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative">{children}</div>
    </div>
  )
}

function TabPage({
  tab,
  index,
  slugs,
  isActivated,
  isActive,
}: {
  tab: (typeof TABS)[number]
  index: number
  slugs: string[]
  isActivated: boolean
  isActive: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { user, loading: authLoading } = useAuth()
  const isFollowingTab = tab.id === "following"
  // Stable for the whole session; the same value across every tab and refetch.
  const [seed] = useState(getFeedSeed)

  // SWR key; null reproduces the old fetch gating (not activated yet, no
  // interests, or following tab before auth resolves). The For You feed pins a
  // per-session seed so its order stays stable under revalidation; feed lists
  // now revalidate when stale again (SWR default), picking up new posts and
  // fresh counts without reshuffling the order under the user.
  let key: string | null = null
  if (isActivated) {
    if (isFollowingTab) {
      // Gate on token presence, not the /me round trip: the following feed only
      // needs the Bearer token, so it starts loading during session restore
      // instead of waiting for it. An invalid token 401s here and clears via
      // AuthProvider, which then shows the logged-out state.
      if (hasToken()) key = "/api/feed/following"
    } else if (slugs.length > 0) {
      const params = new URLSearchParams({ interests: slugs.join(","), seed })
      if (tab.format) params.set("format", tab.format)
      key = `/api/feed?${params}`
    }
  }
  const { data, error, mutate } = useSWR<Post[]>(key)
  // The following tab still treats a failure as an empty feed (its empty and
  // error states read the same). The other tabs used to leave posts at null on
  // error, which is indistinguishable from loading, so they now branch on error
  // below and offer a retry.
  const posts: Post[] | null = isFollowingTab ? (error ? [] : data ?? null) : data ?? null

  // Read the saved scroll target for this tab once, up front (without consuming
  // it), so the window below can mount the target card on the very first paint.
  // A mandatory-snap feed has no snap target at the restored offset otherwise,
  // and snaps back toward the top.
  const [restoreIndex] = useState(() => {
    if (typeof window === "undefined") return 0
    try {
      const raw = sessionStorage.getItem("feedScrollPosition")
      if (!raw) return 0
      const { index, tabId } = JSON.parse(raw)
      return tabId === tab.id && typeof index === "number" ? index : 0
    } catch {
      return 0
    }
  })

  // Window the card list: only the active card plus a small overscan stay
  // mounted; the rest collapse into dvh spacers so DOM size no longer grows
  // with the corpus. Seeded with restoreIndex so the target card is mounted
  // before the scroll position is restored below.
  const { start, end } = useWindowedFeed(scrollRef, posts?.length ?? 0, restoreIndex)

  // Layout effect (runs before paint) so the scroll lands on the target card
  // without a visible snap-to-top flash. Uses the saved index: every card is
  // one viewport tall, so scrollTop = index * clientHeight.
  useIsomorphicLayoutEffect(() => {
    if (posts === null || !scrollRef.current) return
    const raw = sessionStorage.getItem("feedScrollPosition")
    if (!raw) return
    try {
      const { index, tabId } = JSON.parse(raw)
      // Only the matching tab consumes (and clears) the entry; a mismatch leaves
      // it for the correct tab.
      if (tabId !== tab.id) return
      scrollRef.current.scrollTop = index * scrollRef.current.clientHeight
      sessionStorage.removeItem("feedScrollPosition")
    } catch {
      // Corrupt entry: drop it so it cannot wedge scroll restore.
      sessionStorage.removeItem("feedScrollPosition")
    }
  }, [posts, tab.id])

  return (
    // pb-24 clears the floating dock (12px inset + 56px tall).
    <div
      ref={scrollRef}
      {...tabPanelProps(FEED_TABS_ID, index, isActive)}
      className="w-full shrink-0 snap-start h-[100dvh] overflow-y-scroll snap-y snap-mandatory overscroll-y-contain pb-24"
    >
      {!isActivated ? (
        <div className="h-full bg-surface-0" />
      ) : isFollowingTab && !authLoading && !user ? (
        <div className="h-full flex items-center justify-center bg-surface-0 px-6">
          <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-3">
            <p className="font-serif text-xl text-ink leading-snug">See posts from people you follow</p>
            <Link href="/login" className="btn btn-primary px-5 py-2">
              Log in
            </Link>
          </div>
        </div>
      ) : isFollowingTab && posts !== null && posts.length === 0 ? (
        <div className="h-full flex items-center justify-center bg-surface-0 px-6">
          <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-3">
            <p className="font-serif text-xl text-ink leading-snug">Nothing here yet</p>
            <p className="text-ink-muted text-sm">Posts from people you follow will show up here.</p>
            <Link href="/search" className="btn btn-primary px-5 py-2">
              Find people
            </Link>
          </div>
        </div>
      ) : !isFollowingTab && error ? (
        <div className="h-full flex items-center justify-center bg-surface-0 px-6">
          <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-3">
            <p className="font-serif text-xl text-ink leading-snug">Could not load your feed</p>
            <p className="text-ink-muted text-sm">Check your connection and try again.</p>
            <button onClick={() => mutate()} className="btn btn-primary px-5 py-2">
              Retry
            </button>
          </div>
        </div>
      ) : posts === null ? (
        // Loading: pulsing slabs floating where the card slab would sit.
        <div className="h-full flex flex-col justify-center bg-surface-0 px-5 gap-4">
          <div className="stage-pulse card h-72 w-full" />
          <div className="stage-pulse card h-20 w-3/4" />
        </div>
      ) : posts.length === 0 ? (
        <div className="h-full flex items-center justify-center bg-surface-0 px-6">
          <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-2">
            <p className="font-serif text-xl text-ink leading-snug">Nothing here yet</p>
            <p className="text-ink-muted text-sm">Try adjusting your interests</p>
          </div>
        </div>
      ) : (
        <>
          {start > 0 && <div aria-hidden="true" style={{ height: `${start * 100}dvh` }} />}
          {posts.slice(start, end).map((post) => (
            <PostCard key={post.id} post={post} activeTabId={tab.id} />
          ))}
          {end < posts.length && (
            <div aria-hidden="true" style={{ height: `${(posts.length - end) * 100}dvh` }} />
          )}
        </>
      )}
    </div>
  )
}

export default function Home() {
  const router = useRouter()
  const [slugs, setSlugs] = useState<string[]>([])
  // The swipe pager, sliding indicator and active/activated tab state all
  // live in the shared hook; the indicator is the neutral pill fill whose
  // color never changes — the per-post accent switches hard with the
  // settled card, not the chrome.
  const { activeIndex, activatedIndices, pagerRef, indicatorRef, tabRefs, selectTab } =
    useSwipeTabs({ count: TABS.length, initialIndex: DEFAULT_TAB_INDEX })
  const activeTab = TABS[activeIndex].id
  const tabStripRef     = useRef<HTMLDivElement>(null)
  const isFirstTabCenter = useRef(true)
  const selectTabRef = useRef(selectTab)
  selectTabRef.current = selectTab

  // Stable identities for the two inline call-site props, so the memoized
  // children (and PostCard behind them) are not invalidated every render.
  const handleSearch = useCallback(() => router.push("/search"), [router])
  const handleExitToFeed = useCallback(() => selectTabRef.current(DEFAULT_TAB_INDEX), [])

  // Check localStorage on mount, store interests, and restore active tab from sessionStorage
  useEffect(() => {
    const saved = localStorage.getItem("deepscroll_interests")
    if (!saved) {
      router.replace("/onboarding")
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(saved)
    } catch {
      parsed = null
    }
    if (!Array.isArray(parsed)) {
      // Corrupt interests value reads as "not onboarded" rather than crashing.
      router.replace("/onboarding")
      return
    }
    setSlugs(parsed)

    const savedTab = sessionStorage.getItem("feedActiveTab")
    if (savedTab) sessionStorage.removeItem("feedActiveTab")
    const savedIndex = savedTab ? TABS.findIndex((t) => t.id === savedTab) : -1
    // The default tab (For You) is not the first pager page since Following
    // sits left of it, so the pager always needs an instant alignment on
    // mount — to the restored tab if there is one, otherwise the default.
    selectTabRef.current(savedIndex !== -1 ? savedIndex : DEFAULT_TAB_INDEX, {
      behavior: "instant",
    })
  }, [router])

  // Align the active tab: first tab snaps left, last tab snaps right, middle tabs center.
  useEffect(() => {
    const button = tabRefs.current[activeIndex]
    if (!button) return
    const strip = tabStripRef.current
    const behavior: ScrollBehavior = isFirstTabCenter.current ? "instant" : scrollBehavior()
    isFirstTabCenter.current = false

    if (activeIndex === 0) {
      strip?.scrollTo({ left: 0, behavior })
    } else if (activeIndex === TABS.length - 1) {
      strip?.scrollTo({ left: strip.scrollWidth, behavior })
    } else {
      button.scrollIntoView({ behavior, inline: "center", block: "nearest" })
    }
  }, [activeIndex, tabRefs])

  return (
    <PhoneFrame>
      {/* The feed has no visual title; the tab strip is the whole header. An
          sr-only h1 gives the page a document title for heading navigation. */}
      <h1 className="sr-only">Feed</h1>
      <FeedHeader
        tabs={TABS}
        activeTab={activeTab}
        onTabClick={selectTab}
        onSearch={handleSearch}
        tabRefs={tabRefs}
        indicatorRef={indicatorRef}
        tabStripRef={tabStripRef}
      />

      {/* Horizontal strip — one full-width page per tab */}
      <div
        ref={pagerRef}
        className="h-full flex flex-row overflow-x-scroll overflow-y-hidden snap-x snap-mandatory"
      >
        {TABS.map((tab, i) => {
          const isActivated = activatedIndices.has(i)
          // Train and Battle host their own full-screen component instead of a
          // card feed. Gate on activation so the marathon does not run and the
          // battle socket does not connect until the tab is first opened (the
          // empty page keeps swiping cheap, like TabPage's own placeholder).
          if (tab.id === "train" || tab.id === "battle") {
            return (
              <div
                key={tab.id}
                {...tabPanelProps(FEED_TABS_ID, i, activeIndex === i)}
                className="w-full shrink-0 snap-start h-[100dvh] bg-surface-0"
              >
                {!isActivated ? (
                  <div className="h-full bg-surface-0" />
                ) : tab.id === "train" ? (
                  <Marathon onExit={handleExitToFeed} />
                ) : (
                  // active gates the battle socket (M143): swiping away
                  // disconnects it, so a background tab is never silently
                  // challengeable and never keeps an idle socket retrying.
                  <Battle onExit={handleExitToFeed} active={activeIndex === i} />
                )}
              </div>
            )
          }
          return (
            <TabPage
              key={tab.id}
              tab={tab}
              index={i}
              slugs={slugs}
              isActivated={isActivated}
              isActive={activeIndex === i}
            />
          )
        })}
      </div>
      <BottomNav activeTab="feed" />
      {/* The one toast element for every card's share feedback. */}
      <ToastHost />
    </PhoneFrame>
  )
}
