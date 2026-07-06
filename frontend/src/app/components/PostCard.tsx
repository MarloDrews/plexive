"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import CommentsBottomSheet from "./CommentsBottomSheet"
import Toast from "./Toast"
import { queueEvent } from "@/app/lib/eventQueue"
import { savePost, unsavePost, isPostSaved } from "@/app/lib/savedPosts"
import { requestAutoRead } from "@/lib/readAloud/autostart"
import { usePostLike } from "@/lib/usePostLike"
import { updatePostInFeedCaches } from "@/app/lib/swr"
import { fcNum, fcStr, type Post } from "@/types/post"
import { formatStyle } from "@/lib/formats"
import { FIELD_GLYPHS } from "@/lib/glyphs"
import { unescapeDollar } from "@/lib/prose"
import Avatar from "@/components/Avatar"
import BookCover from "@/components/BookCover"
import DotScale from "@/components/DotScale"
import SvgBlock from "@/components/SvgBlock"
import VerifiedBadge from "@/components/VerifiedBadge"
import { BookmarkIcon, CommentIcon, HeartIcon, SendIcon, SpeakerIcon } from "./icons"

export type { Post }

const MIN_DWELL_MS = 500

// Teaser bullets — prominence comes from typography alone: reading-size
// text (17px, matching prose-post) in full ink, sitting directly on the
// slab. Deliberately no second surface, border or vertical line (the slab
// already carries its left accent edge) and nothing button-shaped. The
// accent dots carry the per-format color; row rhythm and the mt-2 above
// the group keep the teasers reading as their own layer.
function Teasers({ items }: { items: string[] }) {
  return (
    <div className="mt-2 space-y-2.5">
      {items.map((teaser, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-(--accent) mt-2 shrink-0" />
          <span className="text-[1.0625rem] text-ink leading-snug">{unescapeDollar(teaser)}</span>
        </div>
      ))}
    </div>
  )
}

// Large category glyph for the typographic formats: a bold accent mark anchored
// to the TOP RIGHT of the card, filling the field-line zone from the label's top
// down to the headline (LAYOUT_STANDARD s2, SVG_STANDARD s6). It is an absolute
// OVERLAY: taken out of the flow, it occupies no layout space and so never moves
// the label or the headline — the field-line row keeps its height (min-h-7) and
// the label stays put. The glyph height is the row height plus `reach` (a negative
// bottom inset that bleeds down to the headline top; the amount is the format's
// field-line-to-headline gap, passed by the caller so the glyph never overlaps the
// headline). Width follows the glyph's own viewBox aspect (landscape ~56x32) and
// is capped (max-w) so it keeps a clear gap from the label and never runs under it.
// The glyph belongs to the post's primary category, its first tag (tags[0]), from
// the app-owned FIELD_GLYPHS set (ROADMAP.md); trusted content, so the official SVG
// path (isUserContent=false). The accent bar (SlabAccent) is a separate element and
// stays continuous.
function FieldGlyph({ slug, reach = "bottom-0" }: { slug: string | undefined; reach?: string }) {
  const svg = slug ? FIELD_GLYPHS[slug] : undefined
  if (!svg) return null
  return (
    <SvgBlock
      svg={svg}
      isUserContent={false}
      className={`pointer-events-none absolute top-0 right-0 ${reach} flex items-center justify-end max-w-[45%] [&_svg]:h-full [&_svg]:w-auto [&_img]:h-full [&_img]:w-auto`}
    />
  )
}

// Format-colored glow behind a slab — a faint radial wash of the post's
// accent bleeding from behind the slab into the dark, so the content reads
// as a light source on the Stage. Static (never animated), very low
// intensity, and it fades out well before the screen edges so the frosted
// chrome above and below keeps a pure-black backdrop. Rendered inside each
// card's own DOM reading that card's --accent: the color switches hard with
// the snapped post — there is no shared glow element to crossfade. Gradient
// falloff instead of filter blur keeps it cheap with many cards mounted.
export function SlabGlow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none ${
        className ?? "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] aspect-square"
      }`}
      style={{
        background:
          "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%)",
      }}
    />
  )
}

// Accent carriers on a slab: a thin vertical bar on the left edge plus a
// faint tint falling from the top edge, both clipped into the slab's rounded
// corners (the host slab adds relative + overflow-hidden). A single edge
// accent, never a border or fill — the slab itself stays borderless and
// neutral. Shared with the post detail header slab.
export function SlabAccent() {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-[3px] bg-(--accent)"
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-12 bg-linear-to-b from-(--accent)/8 to-transparent pointer-events-none"
      />
    </>
  )
}

// Slab footer: creator byline on the left, neutral reading metadata on the
// right. The meta line is deliberately uniform across all seven formats —
// reading time + difficulty only. Format-specific fields (year, era,
// lifespan, genre, venue, ...) stay in the post JSON and render on the
// detail page, never on the card.
function CardFooter({ post, fc }: { post: Post; fc: Post["feed_card"] }) {
  const difficulty = fcNum(fc, "post_difficulty")
  // Reading time is computed on the server from the post's text (post.reading_minutes).
  const metaText = `${post.reading_minutes} min`
  return (
    <div className="flex items-center gap-2 pt-1 min-w-0">
      {post.author_username && (
        <span className="flex items-center gap-1.5 min-w-0">
          <Avatar username={post.author_username} avatarUrl={post.author_avatar_url} size={24} />
          <span className="text-xs text-ink-dim truncate">@{post.author_username}</span>
          {(post.author_is_verified ?? 0) > 0 && (
            <VerifiedBadge size={12} level={post.author_is_verified ?? 1} />
          )}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2 shrink-0">
        {difficulty > 0 && <DotScale value={difficulty as 1 | 2 | 3} />}
        {metaText && (
          <span className="text-[11px] font-mono text-ink-muted leading-none">{metaText}</span>
        )}
      </span>
    </div>
  )
}

export default function PostCard({ post, activeTabId }: { post: Post; activeTabId: string }) {
  const router = useRouter()
  const cardRef           = useRef<HTMLDivElement>(null)
  const viewStartRef      = useRef<number | null>(null)
  const lastTapRef        = useRef<number>(0)
  const navTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { liked, likesCount, toggleLike, syncFromStorage } = usePostLike(post.id, post.like_count)

  const [visible, setVisible] = useState(false)
  const [commentsCount, setCommentsCount] = useState(post.comment_count)
  const [saved, setSaved] = useState(() => isPostSaved(post.id))
  // Saves are local-only (no backend endpoint yet), so the count can only
  // reflect this user's own save state.
  const [saveCount, setSaveCount] = useState(() => (isPostSaved(post.id) ? 1 : 0))
  const [animatingSave, setAnimatingSave] = useState(false)
  const [animatingLike, setAnimatingLike] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [showHeartAnim, setShowHeartAnim] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)

  const style = formatStyle(post.format)
  const fc = post.feed_card

  useEffect(() => {
    // Reduced motion only disables the entrance animation — view tracking
    // and like-state refresh must still run for those users.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduceMotion) setVisible(true)

    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          viewStartRef.current = Date.now()
          if (!reduceMotion) setVisible(true)
          syncFromStorage()
        } else {
          if (viewStartRef.current !== null) {
            const duration_ms = Date.now() - viewStartRef.current
            if (duration_ms >= MIN_DWELL_MS) {
              queueEvent({ post_id: post.id, event_type: "view", duration_ms })
            }
            viewStartRef.current = null
          }
          if (!reduceMotion) setVisible(false)
        }
      },
      { threshold: 0.6 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [post.id, syncFromStorage])

  // A fresh like fires the heart animation; an unlike does not. The like/unlike
  // logic, event queueing and count reconciliation live in usePostLike.
  function handleToggleLike() {
    if (toggleLike() === "liked") {
      setAnimatingLike(true)
      setShowHeartAnim(true)
    }
  }

  function handleSaveClick(e: React.MouseEvent) {
    e.stopPropagation()
    const next = !saved
    setSaved(next)
    if (next) {
      savePost(post.id)
      setAnimatingSave(true)
      setSaveCount((prev) => prev + 1)
    } else {
      unsavePost(post.id)
      setSaveCount((prev) => Math.max(0, prev - 1))
    }
  }

  function navigate() {
    const container = cardRef.current?.parentElement
    if (container) {
      sessionStorage.setItem(
        "feedScrollPosition",
        JSON.stringify({ scrollTop: container.scrollTop, tabId: activeTabId })
      )
    }
    sessionStorage.setItem("feedActiveTab", activeTabId)
    router.push(`/post/${post.id}`)
  }

  function handleCardClick() {
    const now = Date.now()
    const elapsed = now - lastTapRef.current
    lastTapRef.current = now

    if (elapsed < 300) {
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current)
        navTimerRef.current = null
      }
      if (!liked) handleToggleLike()
      return
    }

    navTimerRef.current = setTimeout(() => {
      navTimerRef.current = null
      navigate()
    }, 300)
  }

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation()
    const url = window.location.origin + "/post/" + post.id
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, text: fcStr(fc, "essence"), url })
      } else {
        await navigator.clipboard.writeText(url)
        setToastVisible(true)
        setTimeout(() => setToastVisible(false), 2000)
      }
    } catch {
      // User cancelled share or clipboard failed
    }
  }

  return (
    <div
      ref={cardRef}
      onClick={handleCardClick}
      // --accent drives every format-colored detail inside the card.
      style={{ cursor: "pointer", ["--accent" as string]: style.accent }}
      // Invariant wrapper: the vertical snap feed and scroll restore depend
      // on these classes. One post fills the screen; nothing bleeds in.
      className="h-[100dvh] relative overflow-hidden shrink-0 snap-start [scroll-snap-stop:always] bg-surface-0"
    >
      {/* Format glow — behind the z-10 content, clipped by the card's own
          overflow-hidden so it never reaches neighboring posts or chrome. */}
      <SlabGlow />

      {/* Double-tap heart overlay */}
      {showHeartAnim && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-24 h-24 text-lamp heart-boom"
            onAnimationEnd={() => setShowHeartAnim(false)}
          >
            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.218l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
          </svg>
        </div>
      )}

      {/* Content floats in the dark: marker + slab, centered vertically. */}
      <div className="relative h-full flex flex-col justify-center px-5 pt-16 pb-28 z-10">
        <div
          className={`transition-all duration-500 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* Format marker floating above the slab — dot and label both carry
              the per-format accent so the format is legible at a glance. The
              read-aloud button sits at the row's right end — the post
              block's top-right corner: it belongs to the post, not to the
              social action rail. (Inside the slab surface it would collide
              with the books cover / people portrait layouts.) It opens the
              detail page with reading already started. */}
          <div className="flex items-center gap-2 mb-3 px-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-(--accent)" />
            <span className="text-xs font-mono lowercase tracking-widest text-(--accent)">
              {style.badge.toLowerCase()}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                requestAutoRead(post.id)
                navigate()
              }}
              aria-label="Read aloud"
              className="ml-auto -my-2 w-8 h-8 flex items-center justify-center text-ink-dim hover:text-ink cursor-pointer transition-all duration-150 active:scale-90"
            >
              <SpeakerIcon className="w-5 h-5" />
            </button>
          </div>

          {post.format === "books" && fc ? (
            <div className="card relative overflow-hidden px-6 py-7 flex flex-col gap-4">
              <SlabAccent />
              {/* Title row + cover */}
              <div className="flex gap-4 items-start">
                <div className="flex-1 min-w-0">
                  <h2 className="font-serif text-[1.75rem] font-medium tracking-tight text-ink leading-snug">
                    {fc.title as string}
                  </h2>
                  <p className="text-ink-dim text-sm font-medium mt-1">{fc.author as string}</p>
                </div>
                {/* Two-tier cover (real or generated), resolved the same way as
                    the detail header. Thumbnail size, so no credit line here. */}
                <BookCover
                  feedCard={fc}
                  isUserContent={post.is_user_content}
                  className="shrink-0 rounded-xl overflow-hidden w-16 h-24 bg-white/[0.06]"
                />
              </div>

              {/* Dek: the one-line italic gloss (LAYOUT_STANDARD s2), between the
                  author context line and the teasers, the same treatment concepts
                  and people use. Books' card dek is one_line (the feed_card has no
                  essence field). */}
              {fcStr(fc, "one_line") && (
                <p className="font-serif italic text-base text-ink-body leading-relaxed">{unescapeDollar(fcStr(fc, "one_line"))}</p>
              )}

              {/* Teasers */}
              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}

              <CardFooter post={post} fc={fc} />
            </div>
          ) : post.format === "people" && fc ? (
            <div className="card relative overflow-hidden px-6 py-7 flex flex-col gap-4">
              <SlabAccent />
              <div className="flex gap-4 items-start">
                {(fc.portrait as { image_url?: string } | undefined)?.image_url && (
                  <div className="shrink-0 w-20 h-20 rounded-full overflow-hidden bg-white/[0.06]">
                    <img
                      src={(fc.portrait as { image_url: string }).image_url}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover object-top"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {fcStr(fc, "role") && (
                    <p className="label-caps text-(--accent) mb-0.5">
                      {fcStr(fc, "role")}
                    </p>
                  )}
                  <h2 className="font-serif text-[1.75rem] font-medium tracking-tight text-ink leading-snug">
                    {fc.name as string}
                  </h2>
                  {fcStr(fc, "lifespan") && (
                    <p className="text-ink-muted text-xs font-mono mt-0.5">{fcStr(fc, "lifespan")}</p>
                  )}
                </div>
              </div>

              {/* Dek: People's card gloss is one_line (the feed_card has no
                  essence field, unlike Books). LAYOUT_STANDARD s4. */}
              {fcStr(fc, "one_line") && (
                <p className="font-serif italic text-base text-ink-body leading-relaxed">{unescapeDollar(fcStr(fc, "one_line"))}</p>
              )}

              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}

              <CardFooter post={post} fc={fc} />
            </div>
          ) : post.format === "facts" && fc ? (
            <div className="card relative overflow-hidden px-6 py-7 flex flex-col gap-4">
              <SlabAccent />
              {/* Typographic card: a field line (category label at the top left, the
                  large category glyph filling the top right as an overlay) then the
                  full-width serif headline. */}
              <div className="flex flex-col gap-1">
                <div className="relative min-h-7 flex items-center">
                  {post.primary_category_name && (
                    <p className="label-caps text-(--accent)">{post.primary_category_name}</p>
                  )}
                  <FieldGlyph slug={post.tags?.[0]} reach="-bottom-1" />
                </div>
                <h2 className="font-serif text-[1.75rem] font-medium tracking-tight text-ink leading-snug">
                  {fc.headline as string}
                </h2>
              </div>

              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}

              <CardFooter post={post} fc={fc} />
            </div>
          ) : post.format === "concepts" && fc ? (
            <div className="card relative overflow-hidden px-6 py-7 flex flex-col gap-4">
              <SlabAccent />
              {/* Field line: category label top left, large category glyph filling
                  the top right as an overlay, same as the facts card (LAYOUT_STANDARD s2.1). */}
              <div className="flex flex-col gap-1">
                <div className="relative min-h-7 flex items-center">
                  {post.primary_category_name && (
                    <p className="label-caps text-(--accent)">{post.primary_category_name}</p>
                  )}
                  <FieldGlyph slug={post.tags?.[0]} reach="-bottom-1" />
                </div>
                <h2 className="font-serif text-[1.75rem] font-medium tracking-tight text-ink leading-snug">
                  {fcStr(fc, "concept_name")}
                </h2>
              </div>
              {fcStr(fc, "one_line") && (
                <p className="font-serif italic text-base text-ink-body leading-relaxed">{unescapeDollar(fcStr(fc, "one_line"))}</p>
              )}

              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}

              <CardFooter post={post} fc={fc} />
            </div>
          ) : post.format === "questions" && fc ? (
            <div className="card relative overflow-hidden px-6 py-7 flex flex-col gap-4">
              <SlabAccent />
              {/* Field line: category label top left, large category glyph filling
                  the top right as an overlay, same as facts/concepts (LAYOUT_STANDARD s2.1). */}
              <div className="flex flex-col gap-1">
                <div className="relative min-h-7 flex items-center">
                  {post.primary_category_name && (
                    <p className="label-caps text-(--accent)">{post.primary_category_name}</p>
                  )}
                  <FieldGlyph slug={post.tags?.[0]} reach="-bottom-1" />
                </div>
                <h2 className="font-serif text-[1.75rem] font-medium tracking-tight text-ink leading-snug">
                  {fcStr(fc, "the_question")}
                </h2>
              </div>
              {/* Dek: the one-line italic gloss (LAYOUT_STANDARD s2), the same
                  treatment concepts/people/books use. */}
              {fcStr(fc, "one_line") && (
                <p className="font-serif italic text-base text-ink-body leading-relaxed">{unescapeDollar(fcStr(fc, "one_line"))}</p>
              )}

              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}

              <CardFooter post={post} fc={fc} />
            </div>
          ) : post.format === "stories" && fc ? (
            <div className="card relative overflow-hidden px-6 py-7 flex flex-col gap-4">
              <SlabAccent />
              {/* Stories is the third card look (LAYOUT_STANDARD s1): a real lead
                  image as a slim full-width top band when one fits, not a side
                  cover, because story headlines are long. Full-bleed via negative
                  margins that cancel the slab px-6/py-7 padding (block so no inline
                  baseline gap); max-w-none is required because Tailwind Preflight
                  sets img { max-width: 100% }, which otherwise clamps the
                  calc(100%+3rem) width back to the content box and re-insets the
                  right edge by 3rem. The slab's rounded overflow-hidden clips the
                  top corners while the bottom runs straight into the content. A dead
                  URL hides the band. pointer-events-none + draggable=false keep the bare
                  image from swallowing the tap or opening the platform image viewer,
                  so a tap anywhere falls through to the card's navigate handler.
                  object-position keeps the central scene (faces and table) in frame
                  on a slim crop of a near-square image. */}
              {fcStr(fc, "lead_image_url") && (
                <img
                  src={fcStr(fc, "lead_image_url")}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="block -mx-6 -mt-7 w-[calc(100%+3rem)] max-w-none h-32 object-cover object-[center_38%] pointer-events-none select-none"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                />
              )}
              {/* Context line: the era (accent) with the reader-facing story
                  category beside it. There is no dek on a stories card; the
                  headline carries the narrative opening alone. The field glyph
                  (keyed on tags[0]) fills the top right as a large overlay ONLY when
                  there is no lead band, the same field-line shape as the typographic
                  cards (LAYOUT_STANDARD s1/s2). */}
              <div className="flex flex-col gap-1">
                <div className={`relative flex items-center ${!fcStr(fc, "lead_image_url") ? "min-h-7" : ""}`}>
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {fcStr(fc, "era_label") && (
                      <span className="label-caps text-(--accent)">{fcStr(fc, "era_label")}</span>
                    )}
                    {post.primary_category_name && (
                      <span className="label-caps text-ink-faint">{post.primary_category_name}</span>
                    )}
                  </div>
                  {!fcStr(fc, "lead_image_url") && (
                    <FieldGlyph slug={post.tags?.[0]} reach="-bottom-1" />
                  )}
                </div>
                <h2 className="font-serif text-2xl font-medium tracking-tight text-ink leading-snug">
                  {fcStr(fc, "headline")}
                </h2>
              </div>

              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}

              <CardFooter post={post} fc={fc} />
            </div>
          ) : post.format === "academy" && fc ? (
            <div className="card relative overflow-hidden px-6 py-7 flex flex-col gap-4">
              <SlabAccent />
              {/* Typographic card like facts/concepts: a field line (category label
                  top left, large category glyph filling the top right as an overlay),
                  then the serif paper title. */}
              <div className="flex flex-col gap-1">
                <div className="relative min-h-7 flex items-center">
                  {post.primary_category_name && (
                    <p className="label-caps text-(--accent)">{post.primary_category_name}</p>
                  )}
                  <FieldGlyph slug={post.tags?.[0]} reach="-bottom-1" />
                </div>
                <h2 className="font-serif text-[1.75rem] font-medium tracking-tight text-ink leading-snug">
                  {fcStr(fc, "title") || post.title}
                </h2>
              </div>
              {/* Context line: short citation (authors_compact already carries
                  the year, e.g. "Friston, 2010") and the venue. published_year
                  stays in the data for sorting but is not printed here, to avoid
                  showing the year twice. */}
              {(fcStr(fc, "authors_compact") || fcStr(fc, "venue")) && (
                <p className="text-xs text-ink-muted font-mono">
                  {[fcStr(fc, "authors_compact"), fcStr(fc, "venue")].filter(Boolean).join(" · ")}
                </p>
              )}
              {/* Dek: the core finding in one technical sentence (key_finding_one_line). */}
              {fcStr(fc, "key_finding_one_line") && (
                <p className="font-serif italic text-base text-ink-body leading-relaxed">
                  {unescapeDollar(fcStr(fc, "key_finding_one_line"))}
                </p>
              )}
              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}
              <CardFooter post={post} fc={fc} />
            </div>
          ) : (
            /* Fallback for unknown formats */
            <div className="card relative overflow-hidden px-6 py-7 flex flex-col gap-4">
              <SlabAccent />
              <h2 className="font-serif text-3xl font-medium tracking-tight text-ink leading-snug">
                {post.title}
              </h2>
              {fcStr(fc, "essence") && (
                <p className="font-serif italic text-base text-ink-body leading-relaxed">{unescapeDollar(fcStr(fc, "essence"))}</p>
              )}
              <CardFooter post={post} fc={fc} />
            </div>
          )}
        </div>
      </div>

      {/* Interest tags — floating pills bottom-left. The box is one chip tall
          and bottom-anchored level with the send button, ending before the
          action column (right-20). The first row fills that width left to
          right; flex-wrap + content-start let overflow chips spill onto a
          second row below the box, into the nav band where the dock covers
          them until scrolled. */}
      {post.interests.length > 0 && (
        <div className="absolute left-4 right-20 bottom-[calc(env(safe-area-inset-bottom)+72px)] flex flex-wrap content-start gap-2 h-7 z-10">
          {post.interests.map((name) => (
            <span
              key={name}
              className="rounded-full bg-white/[0.05] backdrop-blur-md text-ink-dim text-xs px-3 py-1.5"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Action rail — bare glyphs floating at the right edge, no borders or
          containers. Every item is button + a fixed-height count slot (h-3,
          empty/invisible when there is no number) so button centers sit at
          one uniform interval whether or not an action has a count; the last
          item (share) carries no trailing slot since the slot only sets the
          rhythm between items. Press feedback is a springy scale-down. The
          rail bottom-aligns with the first interest-tag row just above the
          nav dock (dock top = safe-area + 68px). */}
      <div className="absolute right-2 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-10 flex flex-col items-center">
        {/* Like */}
        <div className="flex flex-col items-center">
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleLike() }}
            aria-label={liked ? "Unlike" : "Like"}
            className={`w-11 h-11 flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-90 ${liked ? "text-like" : "text-ink-dim"}`}
          >
            <HeartIcon
              filled={liked}
              className={`w-7 h-7 ${animatingLike ? "heart-pop" : ""}`}
              onAnimationEnd={() => setAnimatingLike(false)}
            />
          </button>
          <span className={`h-3 text-[11px] font-mono leading-none transition-colors duration-150 ${liked ? "text-like" : "text-ink-dim"} ${likesCount === 0 && !liked ? "invisible" : ""}`}>{likesCount}</span>
        </div>

        {/* Comment */}
        <div className="flex flex-col items-center">
          <button
            onClick={(e) => { e.stopPropagation(); setShowComments(true) }}
            aria-label="Comments"
            className="w-11 h-11 flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-90 text-ink-dim"
          >
            <CommentIcon className="w-7 h-7" />
          </button>
          <span className={`h-3 text-[11px] font-mono text-ink-dim leading-none ${commentsCount === 0 ? "invisible" : ""}`}>{commentsCount}</span>
        </div>

        {/* Save */}
        <div className="flex flex-col items-center">
          <button
            onClick={handleSaveClick}
            aria-label={saved ? "Unsave" : "Save"}
            className={`w-11 h-11 flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-90 ${saved ? "text-save" : "text-ink-dim"}`}
          >
            <BookmarkIcon
              filled={saved}
              className={`w-7 h-7 ${animatingSave ? "heart-pop" : ""}`}
              onAnimationEnd={() => setAnimatingSave(false)}
            />
          </button>
          <span className={`h-3 text-[11px] font-mono leading-none transition-colors duration-150 ${saved ? "text-save" : "text-ink-dim"} ${saveCount === 0 && !saved ? "invisible" : ""}`}>{saveCount}</span>
        </div>

        {/* Share */}
        <div className="flex flex-col items-center">
          <button
            onClick={handleShare}
            aria-label="Share"
            className="w-11 h-11 flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-90 text-ink-dim"
          >
            <SendIcon className="w-7 h-7" />
          </button>
        </div>
      </div>

      {showComments && (
        <CommentsBottomSheet
          postId={post.id}
          onClose={() => setShowComments(false)}
          onCountChange={(n) => {
            setCommentsCount(n)
            // Feed lists are cached for the session; without this the count
            // would revert to the cached value when the user navigates back.
            updatePostInFeedCaches(post.id, { comment_count: n })
          }}
        />
      )}

      <Toast message="Link copied!" visible={toastVisible} />
    </div>
  )
}
