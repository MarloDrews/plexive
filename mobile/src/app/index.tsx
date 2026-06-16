import { useCallback, useEffect, useRef, useState } from "react"
import { View } from "react-native"
import type { LayoutChangeEvent } from "react-native"
import { useRouter } from "expo-router"
import PagerView from "react-native-pager-view"
import { getInterestSlugs } from "../lib/interests"
import { DEFAULT_TAB_INDEX, TABS } from "../lib/feedTabs"
import { colors } from "../theme/tokens"
import { PulsingSlab } from "../components/stage"
import FeedTab from "../components/FeedTab"
import Marathon from "../components/train/Marathon"
import Battle from "../components/battle/Battle"
import FeedTabBar, { type FeedTabBarHandle } from "../components/FeedTabBar"
import BottomNav from "../components/BottomNav"
import Toast, { useToast } from "../components/Toast"

// Home: the 9-tab feed (For You + Following + 7 formats), ported from
// frontend/src/app/page.tsx. Horizontal swipe between tabs via PagerView;
// each tab is an independent lazily-fetched vertical snap feed (FeedTab).
// Stage chrome: the tab capsule and the nav dock float over the full-screen
// pager (cards keep their own safe-area clearances), never attached to an
// edge. Onboarding gate: without stored interest slugs this screen redirects
// to /onboarding, exactly like the web localStorage check.

export default function HomeScreen() {
  const router = useRouter()
  // undefined = still reading storage; string[] = onboarded.
  const [slugs, setSlugs] = useState<string[] | undefined>(undefined)
  const [activeIndex, setActiveIndex] = useState(DEFAULT_TAB_INDEX)
  const [activated, setActivated] = useState<Set<number>>(() => new Set([DEFAULT_TAB_INDEX]))
  // Measured height of the pager area; every feed card is exactly this tall,
  // which keeps the vertical paging exact (see FeedTab getItemLayout).
  const [pageHeight, setPageHeight] = useState(0)
  const pagerRef = useRef<PagerView>(null)
  const tabBarRef = useRef<FeedTabBarHandle>(null)
  const { message, show } = useToast()

  useEffect(() => {
    getInterestSlugs().then((stored) => {
      if (!stored || stored.length === 0) router.replace("/onboarding")
      else setSlugs(stored)
    })
  }, [router])

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setPageHeight(e.nativeEvent.layout.height)
  }, [])

  const markActivated = useCallback((index: number) => {
    setActivated((prev) => {
      if (prev.has(index)) return prev
      const next = new Set(prev)
      next.add(index)
      return next
    })
  }, [])

  const goToTab = useCallback(
    (index: number) => {
      setActiveIndex(index)
      markActivated(index)
      pagerRef.current?.setPage(index)
    },
    [markActivated]
  )

  const onComingSoon = useCallback(() => show("Coming soon"), [show])

  // Pulsing slab while the interests gate resolves (or while redirecting).
  if (slugs === undefined) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: 12,
          backgroundColor: colors["surface-0"],
        }}
      >
        <PulsingSlab height={360} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors["surface-0"] }}>
      {/* The pager fills the whole screen; the floating chrome sits on top. */}
      <View style={{ flex: 1 }} onLayout={onLayout}>
        <PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={DEFAULT_TAB_INDEX}
          // Tabs switch by tapping the capsule only. Horizontal swipe is
          // reserved for the feed card's swipe-left-to-open gesture (and the
          // post detail's swipe-right-to-close), so the pager must not also
          // claim it. setPage from the tab bar still works and still animates.
          scrollEnabled={false}
          onPageScroll={(e) =>
            tabBarRef.current?.onPageScroll(e.nativeEvent.position, e.nativeEvent.offset)
          }
          onPageSelected={(e) => {
            const index = e.nativeEvent.position
            setActiveIndex(index)
            markActivated(index)
          }}
        >
          {TABS.map((tab, i) => (
            // collapsable={false} keeps Android from flattening page views.
            <View key={tab.id} collapsable={false} style={{ flex: 1 }}>
              {tab.id === "train" ? (
                // The Train tab hosts the marathon instead of a card feed. Gate
                // on activation so it does not mount/run until first opened (the
                // empty page keeps swiping cheap, like FeedTab's own placeholder).
                activated.has(i) ? (
                  <Marathon onExit={() => goToTab(DEFAULT_TAB_INDEX)} />
                ) : (
                  <View style={{ flex: 1, backgroundColor: colors["surface-0"] }} />
                )
              ) : tab.id === "battle" ? (
                // The Battle tab hosts the 1v1 duel. Gate on activation like
                // Train so the socket does not connect until first opened.
                activated.has(i) ? (
                  <Battle onExit={() => goToTab(DEFAULT_TAB_INDEX)} />
                ) : (
                  <View style={{ flex: 1, backgroundColor: colors["surface-0"] }} />
                )
              ) : tab.id === "spotlight" ? (
                // Spotlight is an empty placeholder tab for now.
                <View style={{ flex: 1, backgroundColor: colors["surface-0"] }} />
              ) : (
                <FeedTab
                  tab={tab}
                  slugs={slugs}
                  activated={activated.has(i)}
                  pageHeight={pageHeight}
                  onComingSoon={onComingSoon}
                />
              )}
            </View>
          ))}
        </PagerView>
      </View>
      <FeedTabBar
        ref={tabBarRef}
        tabs={TABS}
        activeIndex={activeIndex}
        onTabPress={goToTab}
        onSearchPress={() => router.push("/search")}
      />
      <BottomNav active="feed" onComingSoon={onComingSoon} />
      <Toast message={message} />
    </View>
  )
}
