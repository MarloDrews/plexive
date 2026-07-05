import { useEffect, useRef, useState } from "react"
import { Pressable, ScrollView, Text, View } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import { Image } from "expo-image"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { apiFetch } from "../../lib/api"
import { resolveImageUrl } from "../../config"
import { formatStyle } from "../../lib/formats"
import { AccentProvider } from "../../lib/accent"
import { usePostActions } from "../../lib/usePostActions"
import { fcStr, type Post } from "../../types/post"
import { colors, fills, fonts, radius } from "../../theme/tokens"
import { Frosted, MessageSlab, PulsingSlab, SlabAccent, SlabGlow, ghostPillStyle } from "../../components/stage"
import SectionRenderer from "../../components/SectionRenderer"
import RelatedPostsSection from "../../components/sections/RelatedPostsSection"
import { SectionLabel } from "../../components/sections/primitives"
import CommentsBottomSheet from "../../components/CommentsBottomSheet"
import VerifiedBadge from "../../components/VerifiedBadge"
import { sharePost } from "../../lib/share"
import { HeartIcon, BookmarkIcon, ShareIcon, BackIcon } from "../../components/icons"

// Port of frontend/src/app/post/[id]/page.tsx (Stage): full-screen detail
// that slides up over the feed (Stack animation), swipe right to close (same
// dx > 80 && dx > |dy| rule as the web touch handler). Floating frosted back
// circle, header slab with the format glow + accent edge, and a floating
// pill bar carrying the comment, like, save, and share actions — these live
// inside the opened post, not on the feed card. The AccentProvider replaces
// the web's --accent CSS variable for everything below the header.

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const postId = Number(id)
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [post, setPost] = useState<Post | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [showComments, setShowComments] = useState(false)

  const { liked, toggleLike, saved, toggleSave } = usePostActions(postId, 0)

  const isClosingRef = useRef(false)

  useEffect(() => {
    apiFetch(`/api/posts/${postId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Post | null) => {
        if (!data) setNotFound(true)
        else setPost(data)
      })
      .catch(() => setNotFound(true))
  }, [postId])

  function close() {
    if (isClosingRef.current) return
    isClosingRef.current = true
    router.back()
  }

  // Swipe right to close (web: dx > 80 && dx > |dy| in a touchend handler).
  // A plain onTouchEnd on the ScrollView never fires once the scroll claims
  // the gesture, so this is a gesture-handler Pan that only activates on
  // clearly horizontal movement (vertical scrolling and taps stay untouched).
  const swipeClose = Gesture.Pan()
    .activeOffsetX(40)
    .failOffsetX(-20)
    .failOffsetY([-30, 30])
    .runOnJS(true)
    .onEnd((e) => {
      if (e.translationX > 80 && e.translationX > Math.abs(e.translationY)) close()
    })

  const style = post ? formatStyle(post.format) : null

  return (
    <View style={{ flex: 1, backgroundColor: colors["surface-0"] }}>
      <Stack.Screen options={{ animation: "slide_from_bottom", animationDuration: 300 }} />

      {/* Floating frosted back circle (web btn-icon) */}
      <Frosted
        borderRadius={999}
        style={{ position: "absolute", top: insets.top + 12, left: 16, zIndex: 10, width: 44, height: 44 }}
      >
        <Pressable
          onPress={close}
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

      {post && style ? (
        <AccentProvider value={style.accent}>
          <GestureDetector gesture={swipeClose}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: insets.bottom + 96 }}
            style={{ flex: 1 }}
          >
            {/* Header — frosted slab inset from the edges, with the same
                format glow as the feed card behind it. The glow box stays at
                container width and bleeds only a little vertically, so the
                floating back circle keeps a near-black backdrop. */}
            <View>
              <SlabGlow
                accent={style.accent}
                style={{ position: "absolute", left: 0, right: 0, top: -56, bottom: -56 }}
              />
              <View
                style={{
                  marginHorizontal: 12,
                  marginBottom: 12,
                  backgroundColor: fills.slab,
                  borderRadius: radius.slab,
                  overflow: "hidden",
                  paddingHorizontal: 20,
                  paddingVertical: 24,
                }}
              >
                <SlabAccent accent={style.accent} />

                {/* Format marker — dot and label carry the accent */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
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
                </View>

                {/* Books cover */}
                {post.format === "books" && fcStr(post.feed_card, "cover_url") !== "" && (
                  <View style={{ alignItems: "center", marginBottom: 20 }}>
                    <Image
                      source={{ uri: resolveImageUrl(fcStr(post.feed_card, "cover_url")) }}
                      style={{ width: 128, height: 192, borderRadius: 12, backgroundColor: fills.chrome }}
                      contentFit="cover"
                      transition={150}
                    />
                  </View>
                )}

                {/* Title */}
                <Text
                  style={{
                    fontFamily: fonts.serifMedium,
                    fontSize: 30,
                    lineHeight: 38,
                    color: colors.ink,
                    marginBottom: 4,
                  }}
                >
                  {post.title}
                </Text>

                {/* Author (Books) */}
                {post.format === "books" && fcStr(post.feed_card, "author") !== "" && (
                  <Text
                    style={{
                      fontFamily: fonts.sansMedium,
                      fontSize: 14,
                      color: colors["ink-dim"],
                      marginBottom: 12,
                    }}
                  >
                    {fcStr(post.feed_card, "author")}
                  </Text>
                )}

                {/* Attribution */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 16 }}>
                  {post.is_user_content && post.author_username ? (
                    <>
                      <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-muted"] }}>
                        Submitted by @{post.author_username}
                      </Text>
                      {post.author_is_verified != null && post.author_is_verified > 0 && (
                        <VerifiedBadge size={16} level={post.author_is_verified} />
                      )}
                    </>
                  ) : !post.is_user_content ? (
                    <>
                      <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-muted"] }}>
                        Deepscroll
                      </Text>
                      <VerifiedBadge size={12} variant="official" />
                    </>
                  ) : null}
                </View>

                {/* Interest tags as frosted pills */}
                {post.interests.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {post.interests.map((name) => (
                      <View
                        key={name}
                        style={{
                          backgroundColor: fills.chrome,
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors["ink-dim"] }}>
                          {name}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Sections */}
            <SectionRenderer
              sections={post.sections}
              isUserContent={post.is_user_content}
              postId={post.id}
              readingMinutes={post.reading_minutes}
            />

            {/* Read Next — server-resolved featured edges (graph_edges.
                resolved_read_next). Rendered directly; never re-derived here.
                Defensively capped at 3 even though the server already caps it. */}
            {(() => {
              const readNext = (post.read_next ?? []).slice(0, 3)
              if (readNext.length === 0) return null
              return (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.edge }}>
                  <View style={{ paddingHorizontal: 24, paddingTop: 24 }}>
                    <SectionLabel color={style.accent}>Read Next</SectionLabel>
                  </View>
                  <RelatedPostsSection content={readNext} />
                </View>
              )
            })()}
          </ScrollView>
          </GestureDetector>

          {/* Floating pill action bar — detached from every edge, carrying
              the comment, like, save, and share actions for the post. The
              comment pill opens the shared bottom sheet. */}
          <Frosted
            borderRadius={999}
            style={{ position: "absolute", left: 12, right: 12, bottom: insets.bottom + 12, zIndex: 10 }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 8,
                paddingVertical: 6,
              }}
            >
              <Pressable
                onPress={() => setShowComments(true)}
                style={{
                  flex: 1,
                  height: 44,
                  backgroundColor: fills.chrome,
                  borderRadius: 999,
                  paddingHorizontal: 16,
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors["ink-muted"] }}>
                  Add a comment...
                </Text>
              </Pressable>

              <Pressable
                onPress={toggleLike}
                hitSlop={4}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: liked ? colors.like + "1A" : fills.chrome,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
              >
                <HeartIcon size={20} color={liked ? colors.like : colors["ink-dim"]} filled={liked} />
              </Pressable>

              <Pressable
                onPress={toggleSave}
                hitSlop={4}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: saved ? colors.save + "1A" : fills.chrome,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
              >
                <BookmarkIcon size={20} color={saved ? colors.save : colors["ink-dim"]} filled={saved} />
              </Pressable>

              <Pressable
                onPress={() => sharePost(post)}
                hitSlop={4}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: fills.chrome,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
              >
                <ShareIcon size={20} color={colors["ink-dim"]} />
              </Pressable>
            </View>
          </Frosted>

          {showComments && (
            <CommentsBottomSheet postId={post.id} onClose={() => setShowComments(false)} />
          )}
        </AccentProvider>
      ) : notFound ? (
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}>
          <MessageSlab>
            <Text style={{ fontFamily: fonts.serifMedium, fontSize: 18, color: colors.ink, textAlign: "center" }}>
              Post not found
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors["ink-muted"], textAlign: "center" }}>
              It may have been removed or is awaiting review.
            </Text>
            <Pressable
              onPress={close}
              style={({ pressed }) => [ghostPillStyle, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors["ink-body"] }}>
                Go back
              </Text>
            </Pressable>
          </MessageSlab>
        </View>
      ) : (
        // Loading: pulsing slabs where the header and body will appear.
        <View style={{ flex: 1, paddingTop: insets.top + 64, paddingHorizontal: 12, gap: 12 }}>
          <PulsingSlab height={224} />
          <PulsingSlab height={112} style={{ width: "75%" }} />
        </View>
      )}
    </View>
  )
}
