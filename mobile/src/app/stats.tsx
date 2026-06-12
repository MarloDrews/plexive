import { useCallback, useEffect, useRef, useState } from "react"
import { Text, View, useWindowDimensions } from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import PagerView from "react-native-pager-view"
import { useSharedValue } from "react-native-reanimated"
import { useAuth } from "../lib/auth"
import { apiFetch } from "../lib/api"
import { getSavedPostIds } from "../lib/savedPosts"
import { colors, fonts } from "../theme/tokens"
import { MessageSlab, PulsingSlab } from "../components/stage"
import SegmentedTabs from "../components/SegmentedTabs"
import PrimaryButton from "../components/PrimaryButton"
import GlobalTab from "../components/stats/GlobalTab"
import MyStatsTab from "../components/stats/MyStatsTab"
import FriendsTab from "../components/stats/FriendsTab"
import BottomNav from "../components/BottomNav"
import Toast, { useToast } from "../components/Toast"
import type { GlobalStats, MyStats } from "../components/stats/types"

// Port of frontend/src/app/stats/page.tsx: Global / Personal / Friends in a
// swipeable pager under a segmented capsule. Pages mount lazily on first
// visit (the Friends fan-out fetch must not run on load); global stats are
// fetched on mount and personal stats in parallel once the session is
// restored, like the web's SWR prefetch.

function LoadingSlabs() {
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, gap: 12 }}>
      <PulsingSlab height={160} />
      <PulsingSlab height={256} />
    </View>
  )
}

function CenteredSlab({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 48 }}>
      <MessageSlab>{children}</MessageSlab>
    </View>
  )
}

export default function StatsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { user } = useAuth()
  const { message, show } = useToast()

  const [activeIndex, setActiveIndex] = useState(0)
  const [activated, setActivated] = useState<Set<number>>(() => new Set([0]))
  const [globalData, setGlobalData] = useState<GlobalStats | null>(null)
  const [globalError, setGlobalError] = useState(false)
  const [myData, setMyData] = useState<MyStats | null>(null)
  const [myError, setMyError] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  const pagerRef = useRef<PagerView>(null)
  const progress = useSharedValue(0)

  useEffect(() => {
    let cancelled = false
    apiFetch("/api/stats/global")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setGlobalData(data)
      })
      .catch(() => {
        if (!cancelled) setGlobalError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Personal stats prefetched in parallel once the session is restored.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    apiFetch("/api/stats/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setMyData(data)
      })
      .catch(() => {
        if (!cancelled) setMyError(true)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  // Saved count comes from AsyncStorage client-side (the API leaves it -1).
  useEffect(() => {
    if (activeIndex !== 1 || !user) return
    getSavedPostIds().then((ids) => setSavedCount(ids.length))
  }, [activeIndex, user])

  const markActivated = useCallback((index: number) => {
    setActivated((prev) => {
      if (prev.has(index)) return prev
      const next = new Set(prev)
      next.add(index)
      return next
    })
  }, [])

  function selectTab(index: number) {
    setActiveIndex(index)
    markActivated(index)
    pagerRef.current?.setPage(index)
  }

  const loginPrompt = (text: string) => (
    <CenteredSlab>
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors["ink-dim"], textAlign: "center" }}>
        {text}
      </Text>
      <PrimaryButton label="Log in" onPress={() => router.push("/login")} />
    </CenteredSlab>
  )

  return (
    <View style={{ flex: 1, backgroundColor: colors["surface-0"] }}>
      {/* Tab switcher — frosted segmented capsule */}
      <View style={{ paddingHorizontal: 12, paddingTop: insets.top + 12, paddingBottom: 8 }}>
        <SegmentedTabs
          labels={["Global", "Personal", "Friends"]}
          activeIndex={activeIndex}
          onSelect={selectTab}
          progress={progress}
        />
      </View>

      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageScroll={(e) => {
          progress.value = e.nativeEvent.position + e.nativeEvent.offset
        }}
        onPageSelected={(e) => {
          const index = e.nativeEvent.position
          setActiveIndex(index)
          markActivated(index)
        }}
      >
        <View key="global" collapsable={false} style={{ flex: 1 }}>
          {activated.has(0) &&
            (globalError ? (
              <CenteredSlab>
                <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors["ink-muted"] }}>
                  Could not load stats.
                </Text>
              </CenteredSlab>
            ) : globalData ? (
              <GlobalTab data={globalData} width={width} />
            ) : (
              <LoadingSlabs />
            ))}
        </View>

        <View key="personal" collapsable={false} style={{ flex: 1 }}>
          {activated.has(1) &&
            (!user ? (
              loginPrompt("Log in to see your personal stats")
            ) : myError ? (
              <CenteredSlab>
                <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors["ink-muted"] }}>
                  Could not load personal stats.
                </Text>
              </CenteredSlab>
            ) : myData ? (
              <MyStatsTab data={myData} savedCount={savedCount} width={width} />
            ) : (
              <LoadingSlabs />
            ))}
        </View>

        <View key="friends" collapsable={false} style={{ flex: 1 }}>
          {activated.has(2) &&
            (!user ? (
              loginPrompt("Log in to compare stats with friends")
            ) : (
              <FriendsTab username={user.username} verifiedLevel={user.is_verified} width={width} />
            ))}
        </View>
      </PagerView>

      <BottomNav active="stats" onComingSoon={() => show("Coming soon")} />
      <Toast message={message} />
    </View>
  )
}
