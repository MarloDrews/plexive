"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import dynamic from "next/dynamic"
import { useAuth } from "@/lib/auth"
import { getSavedPostIds } from "@/lib/savedPosts"
import { useSwipeTabs } from "@/lib/useSwipeTabs"
import BottomNav from "@/components/BottomNav"
import SegmentedTabs from "@/components/SegmentedTabs"
import StatsErrorBoundary from "./StatsErrorBoundary"
import type { GlobalStats, MyStats } from "./types"

// While a tab chunk downloads, show the same pulsing slabs its data-loading
// state uses, so chunk load and data load are indistinguishable.
function TabSkeleton() {
  return (
    <div className="flex flex-col px-3 gap-3 pt-2">
      <div className="stage-pulse card h-40 w-full" />
      <div className="stage-pulse card h-64 w-full" />
    </div>
  )
}

// The three tabs (and with them recharts, ~0.5 MB of JS) load as lazy chunks
// on first tab mount instead of riding in the route's eager chunk. Combined
// with BottomNav no longer prefetching /stats, the chart kit downloads only
// when someone actually opens the stats page.
const GlobalTab = dynamic(() => import("./GlobalTab"), { ssr: false, loading: TabSkeleton })
const MyStatsTab = dynamic(() => import("./MyStatsTab"), { ssr: false, loading: TabSkeleton })
const FriendsTab = dynamic(() => import("./FriendsTab"), { ssr: false, loading: TabSkeleton })

export default function StatsPage() {
  const { user } = useAuth()
  const [savedCount, setSavedCount] = useState(0)

  // Swipeable Global/Personal/Friends pager; the capsule indicator tracks
  // the swipe. activatedIndices keeps lazy mounting: a page renders nothing
  // until first visited (FriendsTab's fan-out fetch must not run on load).
  const { activeIndex, activatedIndices, pagerRef, indicatorRef, tabRefs, selectTab } =
    useSwipeTabs({ count: 3 })

  // Global stats via SWR: a revisit renders the cached data instantly and
  // refreshes silently in the background (stats are aggregates, no reorder).
  const { data: globalData, error: globalError } = useSWR<GlobalStats>("/api/stats/global")
  const globalLoading = !globalData && !globalError

  // Personal stats prefetched in parallel with the global fetch (key is null
  // until the session is restored), so opening the Personal tab is instant.
  const { data: myData, error: myError } = useSWR<MyStats>(user ? "/api/stats/me" : null)
  const myLoading = !myData && !myError

  // Read localStorage saved count client-side (Personal tab is index 1)
  useEffect(() => {
    if (activeIndex !== 1 || !user) return
    setSavedCount(getSavedPostIds().length)
  }, [activeIndex, user])

  // Shared page wrapper: each pager page scrolls vertically on its own, so
  // every tab keeps its own scroll position.
  const pageClass =
    "w-full shrink-0 snap-start h-full overflow-y-auto overscroll-y-contain pt-1 pb-24 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"

  return (
    <StatsErrorBoundary>
    <div className="relative max-w-[430px] mx-auto bg-surface-0 h-[100dvh] flex flex-col">
      {/* Tab switcher — floating frosted segmented capsule */}
      <div className="z-20 px-3 pt-3 pb-2">
        <SegmentedTabs
          labels={["Global", "Personal", "Friends"]}
          activeIndex={activeIndex}
          onSelect={selectTab}
          tabRefs={tabRefs}
          indicatorRef={indicatorRef}
        />
      </div>

      {/* Horizontal pager — one full-width, vertically scrolling page per
          tab. min-h-0 keeps flex-1 inside the viewport; overflow-y-hidden
          because overflow-x: scroll would otherwise force it to auto. */}
      <div
        ref={pagerRef}
        className="flex-1 min-h-0 flex overflow-x-scroll overflow-y-hidden snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
      >
        {/* Per-tab error boundaries (inside the page-level one): a render
            crash in one tab degrades that tab alone; the switcher keeps
            working and the other tabs stay usable. */}
        <div className={pageClass}>
          {activatedIndices.has(0) && (
            <StatsErrorBoundary>
              {globalLoading ? (
                <TabSkeleton />
              ) : globalData ? (
                <GlobalTab data={globalData} />
              ) : (
                <div className="card mx-3 mt-2 px-8 py-10 text-center">
                  <p className="text-ink-muted text-sm">Could not load stats.</p>
                </div>
              )}
            </StatsErrorBoundary>
          )}
        </div>

        <div className={pageClass}>
          {activatedIndices.has(1) && (
            <StatsErrorBoundary>
              {!user ? (
                <div className="flex items-center justify-center h-60 px-6">
                  <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-4">
                    <p className="text-ink-dim text-sm">Log in to see your personal stats</p>
                    <a href="/login" className="btn btn-primary px-5 py-2">
                      Log in
                    </a>
                  </div>
                </div>
              ) : myLoading ? (
                <TabSkeleton />
              ) : myData ? (
                <MyStatsTab data={myData} savedCount={savedCount} />
              ) : (
                <div className="card mx-3 mt-2 px-8 py-10 text-center">
                  <p className="text-ink-muted text-sm">Could not load personal stats.</p>
                </div>
              )}
            </StatsErrorBoundary>
          )}
        </div>

        <div className={pageClass}>
          {activatedIndices.has(2) && (
            <StatsErrorBoundary>
              {!user ? (
                <div className="flex items-center justify-center h-60 px-6">
                  <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-4">
                    <p className="text-ink-dim text-sm">Log in to compare stats with friends</p>
                    <a href="/login" className="btn btn-primary px-5 py-2">
                      Log in
                    </a>
                  </div>
                </div>
              ) : (
                <FriendsTab username={user.username} verifiedLevel={user.is_verified} />
              )}
            </StatsErrorBoundary>
          )}
        </div>
      </div>

      <BottomNav activeTab="stats" />
    </div>
    </StatsErrorBoundary>
  )
}
