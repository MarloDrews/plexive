import { useEffect, useRef, useState } from "react"
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import PagerView from "react-native-pager-view"
import { useSharedValue } from "react-native-reanimated"
import Svg, { Circle, Line, Path } from "react-native-svg"
import { useAuth } from "../lib/auth"
import { apiFetch } from "../lib/api"
import { toggleFollow, type FollowStatus } from "../lib/follow"
import { FORMAT_IDS, FORMAT_STYLES, type FormatId } from "../lib/formats"
import { fcStr, type Post } from "../types/post"
import { colors, fills, fonts, radius } from "../theme/tokens"
import { Frosted, PulsingSlab } from "../components/stage"
import { BackIcon } from "../components/icons"
import Avatar from "../components/Avatar"
import VerifiedBadge from "../components/VerifiedBadge"
import SegmentedTabs from "../components/SegmentedTabs"
import BottomNav from "../components/BottomNav"
import Toast, { useToast } from "../components/Toast"

// Port of frontend/src/app/search/page.tsx (Stage): one debounced (300ms)
// search fetches posts and accounts in parallel; the Posts|Accounts capsule
// flips which fetched list shows (tap or swipe via PagerView); format chips
// refine the posts search server-side. The chips row lives above the pager,
// so the horizontal scrollable never nests inside it.

const FORMAT_CHIPS: { label: string; value: FormatId | "" }[] = [
  { label: "All", value: "" },
  ...FORMAT_IDS.map((id) => ({ label: FORMAT_STYLES[id].label, value: id })),
]

interface UserResult {
  username: string
  is_verified: number
  is_private: boolean
  bio: string | null
  avatar_url: string | null
  is_self: boolean
  follow_status: string | null
}

function snippet(post: Post): string {
  const text = fcStr(post.feed_card, "essence") || fcStr(post.feed_card, "headline")
  return text.length > 120 ? text.slice(0, 120) + "…" : text
}

function PostResultCard({ post }: { post: Post }) {
  const router = useRouter()
  const style = FORMAT_STYLES[post.format as FormatId]
  const text = snippet(post)
  return (
    <Pressable
      onPress={() => router.push(`/post/${post.id}`)}
      style={({ pressed }) => ({
        backgroundColor: pressed ? "rgba(255, 255, 255, 0.07)" : fills.slab,
        borderRadius: radius.slab,
        paddingHorizontal: 16,
        paddingVertical: 12,
      })}
    >
      {style && (
        <Text
          style={{
            fontFamily: fonts.sansSemiBold,
            fontSize: 11,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: style.accent,
          }}
        >
          {style.badge}
        </Text>
      )}
      <Text
        numberOfLines={2}
        style={{ fontFamily: fonts.serifMedium, fontSize: 15, lineHeight: 20, color: colors.ink, marginTop: 2 }}
      >
        {post.title}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-faint"] }}>
          {post.is_user_content && post.author_username ? `@${post.author_username}` : "Deepscroll"}
        </Text>
        {post.is_user_content && post.author_is_verified != null && post.author_is_verified > 0 && (
          <VerifiedBadge size={14} level={post.author_is_verified} />
        )}
      </View>
      {text ? (
        <Text
          numberOfLines={2}
          style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: colors["ink-dim"], marginTop: 4 }}
        >
          {text}
        </Text>
      ) : null}
    </Pressable>
  )
}

function UserRow({ user, loggedIn }: { user: UserResult; loggedIn: boolean }) {
  const router = useRouter()
  const [followStatus, setFollowStatus] = useState<FollowStatus>(user.follow_status as FollowStatus)
  const [busy, setBusy] = useState(false)

  async function onToggleFollow() {
    if (busy) return
    setBusy(true)
    try {
      setFollowStatus(await toggleFollow(user.username, followStatus))
    } finally {
      setBusy(false)
    }
  }

  const following = followStatus === "accepted"
  const requested = followStatus === "pending"

  return (
    <Pressable
      onPress={() => router.push(`/profile/${user.username}`)}
      style={({ pressed }) => ({
        backgroundColor: pressed ? "rgba(255, 255, 255, 0.07)" : fills.slab,
        borderRadius: radius.slab,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      })}
    >
      <Avatar username={user.username} avatarUrl={user.avatar_url} size={44} verified={user.is_verified} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.ink }}>
            @{user.username}
          </Text>
          {user.is_verified > 0 && <VerifiedBadge size={14} level={user.is_verified} />}
        </View>
        {user.bio ? (
          <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-muted"] }}>
            {user.bio}
          </Text>
        ) : user.is_private ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-faint"] }}>Private account</Text>
        ) : null}
      </View>
      {loggedIn && !user.is_self && (
        <Pressable
          onPress={onToggleFollow}
          disabled={busy}
          hitSlop={6}
          style={({ pressed }) => ({
            backgroundColor: following || requested ? fills.chrome : "rgba(124, 111, 255, 0.15)",
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 6,
            opacity: busy ? 0.5 : 1,
            transform: [{ scale: pressed && !busy ? 0.96 : 1 }],
          })}
        >
          <Text
            style={{
              fontFamily: fonts.sansMedium,
              fontSize: 12,
              color: following || requested ? colors["ink-body"] : "#9d93ff",
            }}
          >
            {following ? "Following" : requested ? "Requested" : "Follow"}
          </Text>
        </Pressable>
      )}
    </Pressable>
  )
}

export default function SearchScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user: authUser } = useAuth()
  const { message, show } = useToast()

  const [query, setQuery] = useState("")
  const [formatFilter, setFormatFilter] = useState<FormatId | "">("")
  const [results, setResults] = useState<Post[] | null>(null)
  const [userResults, setUserResults] = useState<UserResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const pagerRef = useRef<PagerView>(null)
  const progress = useSharedValue(0)

  // Debounced parallel search — both endpoints, like the web (no combined
  // search on the backend, independent rate limits).
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults(null)
      setUserResults(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmed })
        if (formatFilter) params.set("format", formatFilter)
        const [postsRes, usersRes] = await Promise.all([
          apiFetch(`/api/search?${params}`),
          apiFetch(`/api/search/users?${new URLSearchParams({ q: trimmed })}`),
        ])
        setResults((await postsRes.json()) as Post[])
        setUserResults((await usersRes.json()) as UserResult[])
      } catch {
        setResults([])
        setUserResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, formatFilter])

  const hasQuery = !!query.trim()

  function selectTab(index: number) {
    setActiveIndex(index)
    pagerRef.current?.setPage(index)
  }

  const loadingSlabs = (
    <View style={{ gap: 8, paddingTop: 8 }}>
      <PulsingSlab height={80} />
      <PulsingSlab height={80} />
      <PulsingSlab height={80} />
    </View>
  )
  const idleMessage = (
    <Text
      style={{
        fontFamily: fonts.sans,
        fontSize: 14,
        color: colors["ink-muted"],
        textAlign: "center",
        paddingTop: 80,
      }}
    >
      Search posts, books, people…
    </Text>
  )

  function emptyState(hint: string) {
    return (
      <View style={{ alignItems: "center", paddingTop: 80, paddingHorizontal: 24, gap: 8 }}>
        <Text style={{ fontFamily: fonts.serifMedium, fontSize: 16, color: colors.ink, textAlign: "center" }}>
          No results for “{query}”
        </Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-muted"] }}>{hint}</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors["surface-0"] }}>
      {/* Top bar: back + pill input + post-search switcher + format chips */}
      <View style={{ paddingHorizontal: 12, paddingTop: insets.top + 12, paddingBottom: 8, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Frosted borderRadius={999} style={{ width: 44, height: 44 }}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
            >
              <BackIcon size={24} color={colors["ink-dim"]} />
            </Pressable>
          </Frosted>

          <View style={{ flex: 1 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search posts, books, people…"
              placeholderTextColor={colors["ink-muted"]}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={{
                backgroundColor: fills.chrome,
                borderRadius: 999,
                paddingLeft: 38,
                paddingRight: 38,
                paddingVertical: 11,
                fontFamily: fonts.sans,
                fontSize: 14,
                color: colors.ink,
              }}
            />
            <View style={{ position: "absolute", left: 12, top: 0, bottom: 0, justifyContent: "center" }} pointerEvents="none">
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Circle cx={11} cy={11} r={8} stroke={colors["ink-muted"]} strokeWidth={2} />
                <Path d="m21 21-4.35-4.35" stroke={colors["ink-muted"]} strokeWidth={2} strokeLinecap="round" />
              </Svg>
            </View>
            {query !== "" && (
              <Pressable
                onPress={() => setQuery("")}
                hitSlop={8}
                style={{ position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" }}
              >
                <Svg width={16} height={16} viewBox="0 0 24 24">
                  <Line x1={18} y1={6} x2={6} y2={18} stroke={colors["ink-muted"]} strokeWidth={2} strokeLinecap="round" />
                  <Line x1={6} y1={6} x2={18} y2={18} stroke={colors["ink-muted"]} strokeWidth={2} strokeLinecap="round" />
                </Svg>
              </Pressable>
            )}
          </View>
        </View>

        {/* Posts | Accounts — appears once a query exists */}
        {hasQuery && (
          <SegmentedTabs
            labels={["Posts", "Accounts"]}
            activeIndex={activeIndex}
            onSelect={selectTab}
            progress={progress}
          />
        )}

        {/* Format chips (refine the posts search server-side) */}
        {activeIndex === 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
            {FORMAT_CHIPS.map((chip) => {
              const isActive = formatFilter === chip.value
              const accent = chip.value ? FORMAT_STYLES[chip.value].accent : colors.ink
              return (
                <Pressable
                  key={chip.value}
                  onPress={() => setFormatFilter(chip.value)}
                  style={{
                    backgroundColor: isActive ? fills.active12 : fills.chrome,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.sansMedium,
                      fontSize: 12,
                      color: isActive ? accent : colors["ink-dim"],
                    }}
                  >
                    {chip.label}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        )}
      </View>

      {/* Results — swipeable pager: Posts | Accounts */}
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageScroll={(e) => {
          progress.value = e.nativeEvent.position + e.nativeEvent.offset
        }}
        onPageSelected={(e) => setActiveIndex(e.nativeEvent.position)}
      >
        <View key="posts" collapsable={false} style={{ flex: 1 }}>
          {loading ? (
            <View style={{ paddingHorizontal: 12 }}>{loadingSlabs}</View>
          ) : !hasQuery ? (
            idleMessage
          ) : (
            <FlatList
              data={results ?? []}
              keyExtractor={(p) => String(p.id)}
              renderItem={({ item }) => <PostResultCard post={item} />}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: insets.bottom + 120 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={results !== null ? emptyState("Try a different word or format") : null}
            />
          )}
        </View>

        <View key="accounts" collapsable={false} style={{ flex: 1 }}>
          {loading ? (
            <View style={{ paddingHorizontal: 12 }}>{loadingSlabs}</View>
          ) : !hasQuery ? (
            idleMessage
          ) : (
            <FlatList
              data={userResults ?? []}
              keyExtractor={(u) => u.username}
              renderItem={({ item }) => <UserRow user={item} loggedIn={!!authUser} />}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: insets.bottom + 120 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={userResults !== null ? emptyState("Try a different username") : null}
            />
          )}
        </View>
      </PagerView>

      <BottomNav onComingSoon={() => show("Coming soon")} />
      <Toast message={message} />
    </View>
  )
}
