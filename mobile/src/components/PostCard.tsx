import { memo, useRef } from "react"
import { Pressable, Text, View, useWindowDimensions } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import { Image } from "expo-image"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated"
import { fcNum, fcStr, type Post } from "../types/post"
import { formatStyle } from "../lib/formats"
import { unescapeDollar } from "../lib/prose"
import { resolveImageUrl } from "../config"
import { usePostActions } from "../lib/usePostActions"
import { colors, fills, fonts, radius } from "../theme/tokens"
import { SlabAccent, SlabGlow } from "./stage"
import VerifiedBadge from "./VerifiedBadge"
import { HeartIcon, SpeakerIcon } from "./icons"

// Full-screen Stage feed card, ported from frontend PostCard.tsx: format
// marker floating above a borderless frosted slab, format-colored glow
// behind it, interest tags as floating pills bottom-left. The like/comment/
// save/share buttons live on the post detail view, not the feed. Tap opens
// the post detail; double tap likes (web 300ms double-tap rule) with the
// heart-boom overlay. Swiping left also opens the post (mirror of the post
// detail's swipe-right-to-close); the home pager has horizontal tab-swiping
// disabled so this gesture owns the horizontal axis here.
// Every card is exactly `height` tall so FlatList paging snaps one card per
// swipe without measuring.

// Difficulty as three neutral dots; the per-format accent stays on the
// format marker and the teaser bullets only (web DotScale).
function DotScale({ value }: { value: number }) {
  return (
    <View className="flex-row" style={{ gap: 4 }}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: i <= value ? colors["ink-dim"] : fills.dotOff,
          }}
        />
      ))}
    </View>
  )
}

// Teaser bullets — reading-size text in full ink directly on the slab, the
// accent dots carry the per-format color (web Teasers).
function Teasers({ items, accent }: { items: string[]; accent: string }) {
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      {items.map((teaser, i) => (
        <View key={i} className="flex-row items-start" style={{ gap: 10 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              marginTop: 7,
              backgroundColor: accent,
            }}
          />
          <Text
            className="flex-1"
            style={{ fontFamily: fonts.sans, fontSize: 17, lineHeight: 22, color: colors.ink }}
          >
            {unescapeDollar(teaser)}
          </Text>
        </View>
      ))}
    </View>
  )
}

// Uppercase 11px tracked label — the web .label-caps utility.
function LabelCaps({ text, color }: { text: string; color: string }) {
  return (
    <Text
      style={{
        fontFamily: fonts.sansSemiBold,
        fontSize: 11,
        letterSpacing: 2,
        textTransform: "uppercase",
        color,
      }}
    >
      {text}
    </Text>
  )
}

// Slab footer: creator byline left, neutral reading metadata right. The meta
// line is uniform across all formats — reading time + difficulty only (web
// CardFooter; year/era/genre/venue stay in the JSON for the detail page).
function CardFooter({ post }: { post: Post }) {
  const fc = post.feed_card
  const difficulty = fcNum(fc, "post_difficulty")
  // Reading time is computed on the server from the post's text (post.reading_minutes).
  const minutes = post.reading_minutes
  return (
    <View className="flex-row items-center" style={{ gap: 8, paddingTop: 4 }}>
      {post.author_username && (
        <View className="flex-row items-center flex-1" style={{ gap: 6 }}>
          {post.author_avatar_url ? (
            <Image
              source={{ uri: post.author_avatar_url }}
              style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: fills.chrome }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View
              className="items-center justify-center"
              style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: fills.chrome }}
            >
              <Text
                style={{
                  fontFamily: fonts.sansSemiBold,
                  fontSize: 11,
                  color: colors["ink-dim"],
                  textTransform: "uppercase",
                }}
              >
                {post.author_username[0]}
              </Text>
            </View>
          )}
          <Text
            numberOfLines={1}
            style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-dim"], flexShrink: 1 }}
          >
            @{post.author_username}
          </Text>
          {(post.author_is_verified ?? 0) > 0 && (
            <VerifiedBadge size={12} level={post.author_is_verified ?? 1} />
          )}
        </View>
      )}
      <View className="flex-row items-center" style={{ gap: 8, marginLeft: "auto" }}>
        {difficulty > 0 && <DotScale value={difficulty} />}
        {minutes > 0 && (
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors["ink-muted"] }}>
            {minutes} min
          </Text>
        )}
      </View>
    </View>
  )
}

const titleStyle = {
  fontFamily: fonts.serifMedium,
  fontSize: 28,
  lineHeight: 35,
  letterSpacing: -0.4,
  color: colors.ink,
} as const

const essenceStyle = {
  fontFamily: fonts.serifItalic,
  fontSize: 16,
  lineHeight: 24,
  color: colors["ink-body"],
} as const

function teasersOf(fc: Record<string, unknown>): string[] {
  return Array.isArray(fc.teasers) ? (fc.teasers as string[]) : []
}

function CardBody({ post }: { post: Post }) {
  const fc = post.feed_card
  const accent = formatStyle(post.format).accent

  if (post.format === "books") {
    return (
      <>
        <View className="flex-row items-start" style={{ gap: 16 }}>
          <View className="flex-1">
            <Text style={titleStyle}>{fcStr(fc, "title")}</Text>
            <Text
              style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors["ink-dim"], marginTop: 4 }}
            >
              {fcStr(fc, "author")}
            </Text>
          </View>
          {fcStr(fc, "cover_url") !== "" && (
            <Image
              source={{ uri: resolveImageUrl(fcStr(fc, "cover_url")) }}
              style={{ width: 64, height: 96, borderRadius: 12, backgroundColor: fills.chrome }}
              contentFit="cover"
              transition={150}
            />
          )}
        </View>
        <Text style={essenceStyle}>{unescapeDollar(fcStr(fc, "essence"))}</Text>
        <Teasers items={teasersOf(fc)} accent={accent} />
        <CardFooter post={post} />
      </>
    )
  }

  if (post.format === "people") {
    const portrait = (fc.portrait as { image_url?: string } | undefined)?.image_url
    return (
      <>
        <View className="flex-row items-start" style={{ gap: 16 }}>
          {portrait && (
            <Image
              source={{ uri: resolveImageUrl(portrait) }}
              style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: fills.chrome }}
              contentFit="cover"
              transition={150}
            />
          )}
          <View className="flex-1">
            {fcStr(fc, "role") !== "" && <LabelCaps text={fcStr(fc, "role")} color={accent} />}
            <Text style={[titleStyle, { marginTop: 2 }]}>{fcStr(fc, "name")}</Text>
            {fcStr(fc, "lifespan") !== "" && (
              <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors["ink-muted"], marginTop: 2 }}>
                {fcStr(fc, "lifespan")}
              </Text>
            )}
          </View>
        </View>
        <Text style={essenceStyle}>{unescapeDollar(fcStr(fc, "essence"))}</Text>
        <Teasers items={teasersOf(fc)} accent={accent} />
        <CardFooter post={post} />
      </>
    )
  }

  if (post.format === "facts") {
    return (
      <>
        {fcStr(fc, "field") !== "" && <LabelCaps text={fcStr(fc, "field")} color={accent} />}
        <Text style={titleStyle}>{fcStr(fc, "headline")}</Text>
        <Teasers items={teasersOf(fc)} accent={accent} />
        <CardFooter post={post} />
      </>
    )
  }

  if (post.format === "concepts" || post.format === "questions") {
    const title = post.format === "concepts" ? fcStr(fc, "concept_name") : fcStr(fc, "the_question")
    const hook = post.format === "concepts" ? fcStr(fc, "one_line") : fcStr(fc, "framing_line")
    return (
      <>
        {fcStr(fc, "field") !== "" && <LabelCaps text={fcStr(fc, "field")} color={accent} />}
        <Text style={titleStyle}>{title}</Text>
        {hook !== "" && <Text style={essenceStyle}>{unescapeDollar(hook)}</Text>}
        <Teasers items={teasersOf(fc)} accent={accent} />
        <CardFooter post={post} />
      </>
    )
  }

  if (post.format === "stories") {
    return (
      <>
        <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
          {fcStr(fc, "era_label") !== "" && <LabelCaps text={fcStr(fc, "era_label")} color={accent} />}
          {fcStr(fc, "category") !== "" && (
            <LabelCaps text={fcStr(fc, "category")} color={colors["ink-faint"]} />
          )}
        </View>
        <Text style={[titleStyle, { fontSize: 24, lineHeight: 30 }]}>{fcStr(fc, "headline")}</Text>
        <Teasers items={teasersOf(fc)} accent={accent} />
        <CardFooter post={post} />
      </>
    )
  }

  if (post.format === "academy") {
    const venueLine = [fcStr(fc, "authors_compact"), fcStr(fc, "venue")].filter(Boolean).join(" · ")
    return (
      <>
        {fcStr(fc, "field") !== "" && <LabelCaps text={fcStr(fc, "field")} color={accent} />}
        <Text style={titleStyle}>{fcStr(fc, "title") || post.title}</Text>
        {venueLine !== "" && (
          <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors["ink-muted"] }}>{venueLine}</Text>
        )}
        {fcStr(fc, "key_finding_one_line") !== "" && (
          <Text style={essenceStyle}>{unescapeDollar(fcStr(fc, "key_finding_one_line"))}</Text>
        )}
        <Teasers items={teasersOf(fc)} accent={accent} />
        <CardFooter post={post} />
      </>
    )
  }

  // Fallback for unknown formats
  return (
    <>
      <Text style={titleStyle}>{post.title}</Text>
      {fcStr(fc, "essence") !== "" && <Text style={essenceStyle}>{unescapeDollar(fcStr(fc, "essence"))}</Text>}
      <CardFooter post={post} />
    </>
  )
}

function PostCard({ post, height }: { post: Post; height: number }) {
  const style = formatStyle(post.format)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()
  const { liked, like } = usePostActions(post.id, post.like_count)

  const lastTapRef = useRef(0)
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Web heart-boom (center overlay) for the double-tap like.
  const boomScale = useSharedValue(0)
  const boomOpacity = useSharedValue(0)

  const boomStyle = useAnimatedStyle(() => ({
    opacity: boomOpacity.value,
    transform: [{ scale: boomScale.value }],
  }))

  function animateLike() {
    boomScale.value = 0
    boomOpacity.value = 1
    boomScale.value = withSequence(withTiming(1.3, { duration: 300 }), withTiming(1, { duration: 300 }))
    boomOpacity.value = withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 }))
  }

  // Open the detail, cancelling any pending tap-driven navigation so a swipe
  // and a tap can never fire the push twice.
  function openPost() {
    if (navTimerRef.current) {
      clearTimeout(navTimerRef.current)
      navTimerRef.current = null
    }
    router.push(`/post/${post.id}`)
  }

  // Web double-tap rule: a second tap within 300ms likes; otherwise navigate
  // after the window closes.
  function handleCardPress() {
    const now = Date.now()
    const elapsed = now - lastTapRef.current
    lastTapRef.current = now

    if (elapsed < 300) {
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current)
        navTimerRef.current = null
      }
      if (!liked) animateLike()
      like()
      return
    }

    navTimerRef.current = setTimeout(() => {
      navTimerRef.current = null
      router.push(`/post/${post.id}`)
    }, 300)
  }

  // Swipe left to open (mirror of the detail's swipe-right-to-close). Only a
  // clearly leftward drag activates, so vertical FlatList paging and taps are
  // untouched; the 80px end threshold matches the close gesture's distance.
  const openSwipe = Gesture.Pan()
    .activeOffsetX(-40)
    .failOffsetX(20)
    .failOffsetY([-30, 30])
    .runOnJS(true)
    .onEnd((e) => {
      if (e.translationX < -80 && Math.abs(e.translationX) > Math.abs(e.translationY)) openPost()
    })

  // The glow box is a square 1.5x the screen width centered on the card,
  // clipped by the card's own overflow so it never reaches neighboring posts
  // or the floating chrome (web SlabGlow placement).
  const glowSize = windowWidth * 1.5

  return (
    <GestureDetector gesture={openSwipe}>
    <Pressable
      onPress={handleCardPress}
      style={{ height, backgroundColor: colors["surface-0"], overflow: "hidden" }}
    >
      <SlabGlow
        accent={style.accent}
        style={{
          position: "absolute",
          width: glowSize,
          height: glowSize,
          left: (windowWidth - glowSize) / 2,
          top: (height - glowSize) / 2,
        }}
      />

      {/* Content floats in the dark: marker + slab, centered vertically.
          Top clearance for the floating tab capsule, bottom clearance for
          the rail/tags row and the nav dock. */}
      <View
        className="flex-1 justify-center"
        style={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 64,
          paddingBottom: insets.bottom + 112,
        }}
      >
        {/* Format marker floating above the slab — dot and label carry the
            accent; the read-aloud placeholder (disabled, no handler) sits at
            the row's right end, like the web. */}
        <View className="flex-row items-center" style={{ gap: 8, marginBottom: 12, paddingHorizontal: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: style.accent }} />
          <Text
            style={{
              fontFamily: fonts.mono,
              fontSize: 12,
              letterSpacing: 1.2,
              textTransform: "lowercase",
              color: style.accent,
            }}
          >
            {style.badge.toLowerCase()}
          </Text>
          <View style={{ marginLeft: "auto", width: 32, height: 32, alignItems: "center", justifyContent: "center", opacity: 0.4 }}>
            <SpeakerIcon size={20} color={colors["ink-dim"]} />
          </View>
        </View>

        {/* Borderless frosted slab with the accent edge */}
        <View
          style={{
            backgroundColor: fills.slab,
            borderRadius: radius.slab,
            overflow: "hidden",
            paddingHorizontal: 24,
            paddingVertical: 28,
            gap: 16,
          }}
        >
          <SlabAccent accent={style.accent} />
          <CardBody post={post} />
        </View>
      </View>

      {/* Double-tap heart overlay (web heart-boom) */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
          },
          boomStyle,
        ]}
      >
        <HeartIcon size={96} color={colors.lamp} filled />
      </Animated.View>

    </Pressable>
    </GestureDetector>
  )
}

// memo: FlatList re-renders list items on scroll-state changes; post objects
// are stable per fetch, so a shallow check skips all off-screen work.
export default memo(PostCard)
