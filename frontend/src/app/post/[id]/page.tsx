"use client"

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { formatStyle } from "@/lib/formats"
import { unescapeDollar } from "@/lib/prose"
import { fcNum, fcStr, type Post } from "@/types/post"
import SectionRenderer from "@/components/SectionRenderer"
import SectionLabel from "@/components/SectionLabel"
import HeadlineSection from "@/components/sections/HeadlineSection"
import RelatedPostsSection from "@/components/sections/RelatedPostsSection"
import CommentsSection from "@/components/CommentsSection"
import CommentBar from "./CommentBar"
import { SlabAccent, SlabGlow } from "@/components/PostCard"
import Avatar from "@/components/Avatar"
import BookCover from "@/components/BookCover"
import DotScale from "@/components/DotScale"
import FieldGlyph from "@/components/FieldGlyph"
import VerifiedBadge from "@/components/VerifiedBadge"
import { PauseIcon, SpeakerIcon, StopIcon } from "@/components/icons"
import { useReadAloud } from "@/lib/readAloud/useReadAloud"
import { consumeAutoRead } from "@/lib/readAloud/autostart"
import { useAuth } from "@/lib/auth"
import { apiFetch } from "@/lib/api"
import { usePostLike } from "@/lib/usePostLike"
import { useComments } from "@/lib/useComments"
import { findPostInFeedCaches, updatePostInFeedCaches } from "@/lib/swr"
import { useSWRConfig } from "swr"

// Shared flat-header meta row: avatar + creator, then the derived quiz-question
// count, difficulty and reading time. Used by every flat header (facts,
// concepts, people) so the row is identical across formats.
function HeaderMeta({ post }: { post: Post }) {
  return (
    <div
      data-no-read
      className="px-6 pb-6 flex items-center gap-2 min-w-0 text-xs"
    >
      {post.author_username && (
        <Link
          href={`/profile/${post.author_username}`}
          className="flex items-center gap-1.5 min-w-0 hover:text-ink-body transition-colors"
        >
          <Avatar username={post.author_username} avatarUrl={post.author_avatar_url} size={24} />
          <span className="text-ink-dim truncate">@{post.author_username}</span>
          {(post.author_is_verified ?? 0) > 0 && (
            <VerifiedBadge size={12} level={post.author_is_verified ?? 1} />
          )}
        </Link>
      )}
      <span className="ml-auto flex items-center gap-2 shrink-0">
        {/* Quiz teaser — derived from the quiz array length, not
            stored in content. Signals a graded quiz waits at the end. */}
        {(() => {
          const q = post.sections.find((s) => s.type === "quiz")
          const n = Array.isArray(q?.content) ? q.content.length : 0
          return n > 0 ? (
            <span className="text-[11px] font-mono text-(--accent) leading-none">
              {n} questions
            </span>
          ) : null
        })()}
        {fcNum(post.feed_card, "post_difficulty") > 0 && (
          <DotScale value={fcNum(post.feed_card, "post_difficulty") as 1 | 2 | 3} />
        )}
        {/* Reading time computed on the server from the post's text. */}
        <span className="text-[11px] font-mono text-ink-muted leading-none">
          {post.reading_minutes} min
        </span>
      </span>
    </div>
  )
}

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const { cache } = useSWRConfig()

  // Seed from the cached feed lists so the tapped card's header (title,
  // feed card, counts, author) paints instantly instead of a full skeleton.
  // List payloads strip sections (serialized []) and carry no read_next, so
  // the body shows its own pulse until the full fetch below replaces this.
  const [post, setPost] = useState<Post | null>(() => findPostInFeedCaches(cache, Number(id)) ?? null)
  const [notFound, setNotFound] = useState(false)
  const [closing, setClosing] = useState(false)

  const { liked, likesCount, toggleLike, reconcile } = usePostLike(Number(id), post?.like_count ?? null)
  // Feed lists are cached for the session; write the comment count through to
  // them whenever it changes here (add, delete, initial load).
  const { comments, error: commentsError, posting, deletingId, postComment, deleteComment } = useComments(
    Number(id),
    (count) => updatePostInFeedCaches(Number(id), { comment_count: count })
  )

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const readableRef        = useRef<HTMLDivElement>(null)
  const commentsTopRef     = useRef<HTMLDivElement>(null)
  const isClosingRef       = useRef(false)

  useEffect(() => {
    // Reset per-id so a client-side post-to-post navigation (Read Next uses
    // next/link now) shows the new post's seed or loading state rather than
    // the previous post, and a slow response for the old id can never
    // overwrite the new post: the stale flag discards it. usePostLike/
    // useComments re-key on Number(id) and reset themselves.
    let stale = false
    setPost(findPostInFeedCaches(cache, Number(id)) ?? null)
    setNotFound(false)
    apiFetch(`/api/posts/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Post | null) => {
        if (stale) return
        if (!data) {
          setPost(null)
          setNotFound(true)
          return
        }
        setPost(data)
      })
      .catch(() => {
        if (!stale) {
          setPost(null)
          setNotFound(true)
        }
      })
    return () => {
      stale = true
    }
  }, [id, cache])

  // The feed card no longer reconciles the like count on mount; the detail page
  // has no visibility observer, so reconcile once the post has loaded.
  useEffect(() => {
    if (post) reconcile()
  }, [post, reconcile])

  const { status: readStatus, start: startReading, stop: stopReading, toggle: toggleReading } =
    useReadAloud(readableRef)

  // Speaker tap on the feed card: the post content is in the DOM once this
  // effect runs (effects fire after render), so reading can start directly.
  useEffect(() => {
    if (post && consumeAutoRead(post.id)) startReading()
  }, [post, startReading])

  function close() {
    if (isClosingRef.current) return
    isClosingRef.current = true
    stopReading()
    setClosing(true)
    setTimeout(() => router.back(), 250)
  }

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    let startX = 0
    let startY = 0

    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }

    function onTouchEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - startX
      const dy = Math.abs(e.changedTouches[0].clientY - startY)
      if (dx > 80 && dx > dy) close()
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchend",   onTouchEnd,   { passive: true })
    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchend",   onTouchEnd)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleToggleLike() {
    if (!post) return
    toggleLike()
  }

  // Scroll the comments heading into view so the user sees their new comment
  // (invoked by CommentBar after a successful post).
  const scrollToComments = useCallback(() => {
    setTimeout(() => {
      commentsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 50)
  }, [])

  const style = post ? formatStyle(post.format) : null
  // Typographic formats (LAYOUT_STANDARD s1) use the banner header: field line +
  // glyph + serif headline + dek, no slab. Facts, concepts and questions share it
  // (questions repeats its one_line dek like concepts, since its body opens on
  // setup rather than restating the question's plain meaning).
  const typographic =
    !!post &&
    (post.format === "facts" || post.format === "concepts" || post.format === "questions")
  // Academy is the second typographic variant (LAYOUT_STANDARD s1): the same flat,
  // no-slab, no-cover header as facts/concepts (field line + glyph + headline),
  // with a citation context line and the key_finding_one_line dek. Kept separate
  // from `typographic` only because it reads different feed-card fields; it is NOT
  // a cover format and shares no centered-cover/portrait behavior.
  const typographicAcademy = !!post && post.format === "academy"
  // Cover formats use the flat (no-slab) header: people opens straight into the
  // page like facts/concepts, with a portrait + context fields instead of a glyph
  // field line (LAYOUT_STANDARD s1/s3). People places the portrait to the left of
  // the name; books centers the two-tier cover above the title. The two cover
  // formats place their image differently on purpose (LAYOUT_STANDARD s3).
  const coverFlat = !!post && post.format === "people"
  const coverBooks = !!post && post.format === "books"
  // Stories is the third card look (LAYOUT_STANDARD s1): a real lead image as a
  // full-width top band when one fits, else the field glyph; the era as the
  // context line; the headline once; no dek (the headline is a narrative opening).
  const coverStories = !!post && post.format === "stories"
  // Every flat header (typographic + cover formats) shares the top-bar format
  // label, the end-of-post tags, and the headline-section filter.
  const flatHeader = typographic || typographicAcademy || coverFlat || coverBooks || coverStories

  // Memoized so SectionRenderer (React.memo) sees a stable prop: without this,
  // the fresh .filter() array on every render defeated the memo and each
  // keystroke or read-aloud tick re-ran the whole section tree.
  // For flat headers the headline section is dropped to avoid doubling it, and
  // questions' the_question too (it is the header headline there; academy's
  // the_question is a real body section and must render).
  const bodySections = useMemo(() => {
    if (!post) return []
    return flatHeader
      ? post.sections.filter(
          (s) =>
            s.type !== "headline" &&
            !(s.type === "the_question" && post.format === "questions")
        )
      : post.sections
  }, [post, flatHeader])

  return (
    <div className="h-[100dvh] bg-surface-0 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative overflow-hidden">
        <div
          className={`absolute inset-0 bg-surface-0 flex flex-col z-40 ${
            closing ? "post-sheet-closing" : "post-sheet-open"
          }`}
          // --accent drives every format-colored detail in the header and
          // sections. The slide animation and its (sheet-scoped) reduced-motion
          // guard live in globals.css.
          style={{ ["--accent" as string]: style?.accent }}
        >
          {/* Back button */}
          <button
            onClick={close}
            className="absolute top-4 left-4 z-10 btn-icon"
            aria-label="Go back"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          {/* Read-aloud transport — mirrors the back button's floating
              btn-icon circles in the opposite corner. Idle shows a single
              speaker; while reading it becomes pause/resume (accent ink)
              plus stop. */}
          {post && (
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              {readStatus !== "idle" && (
                <button onClick={stopReading} className="btn-icon" aria-label="Stop reading">
                  <StopIcon className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={toggleReading}
                className={`btn-icon ${readStatus === "loading" ? "stage-pulse" : ""} ${
                  readStatus === "playing" || readStatus === "paused"
                    ? "btn-icon-active text-(--accent)"
                    : ""
                }`}
                aria-label={
                  readStatus === "playing"
                    ? "Pause reading"
                    : readStatus === "paused"
                      ? "Resume reading"
                      : readStatus === "loading"
                        ? "Preparing audio (tap to cancel)"
                        : "Read aloud"
                }
              >
                {readStatus === "playing" ? (
                  <PauseIcon className="w-5 h-5" />
                ) : (
                  <SpeakerIcon className="w-5 h-5" />
                )}
              </button>
            </div>
          )}

          {/* Format label in the app top bar — the format with its accent dot,
              centered between the back and audio controls. Typographic formats use
              the banner header, where the format lives here rather than in a slab. */}
          {post && style && flatHeader && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-(--accent)" />
              <span className="text-xs font-mono lowercase tracking-widest text-(--accent)">
                {style.badge.toLowerCase()}
              </span>
            </div>
          )}

          {/* Scrollable content */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto pt-16 pb-24 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          >
            {post && style ? (
              <>
                {/* Readable region for read-aloud: header + sections.
                    Comments stay outside so they are never spoken. */}
                <div ref={readableRef}>
                {typographic ? (
                  /* Typographic header per LAYOUT_STANDARD (facts, concepts): a
                     field line (category label top left, large category glyph filling
                     the top right as an overlay, same as the card), the serif headline once, an optional dek,
                     then the meta row. The format label lives in the top bar; the
                     headline section is filtered out of the body below so it never
                     doubles. */
                  <div className="relative">
                    <div className="px-6 pt-4">
                      <div className="relative min-h-7 flex items-center">
                        {post.primary_category_name && (
                          <p className="label-caps text-(--accent)">
                            {post.primary_category_name}
                          </p>
                        )}
                        <FieldGlyph slug={post.tags?.[0]} reach="-bottom-3" />
                      </div>
                    </div>
                    <HeadlineSection content={post.title} />
                    {/* Dek — the one-line plain-language gloss from the feed card,
                        repeated under the headline (LAYOUT_STANDARD s3). Concepts
                        carries one_line; facts has none, so this stays facts-free. */}
                    {fcStr(post.feed_card, "one_line") && (
                      <p className="px-6 -mt-2 mb-5 font-serif italic text-base text-ink-body leading-relaxed">
                        {unescapeDollar(fcStr(post.feed_card, "one_line"))}
                      </p>
                    )}
                    {/* Meta row — round avatar + creator, reading time,
                        difficulty. Reads the same author fields as the feed
                        card footer, so the two always match. */}
                    <HeaderMeta post={post} />
                  </div>
                ) : typographicAcademy ? (
                  /* Academy typographic header (LAYOUT_STANDARD s1): the same flat
                     structure as facts/concepts — a field line (category label top left,
                     large category glyph filling the top right as an overlay), the paper title as the
                     single serif headline, then a citation context line
                     (authors_compact / published_year / venue), the
                     key_finding_one_line dek, and the shared meta row. No slab, no
                     cover. The full bibliographic record follows in the paper_card
                     section below. */
                  <div className="relative">
                    <div className="px-6 pt-4">
                      <div className="relative min-h-7 flex items-center">
                        {post.primary_category_name && (
                          <p className="label-caps text-(--accent)">
                            {post.primary_category_name}
                          </p>
                        )}
                        <FieldGlyph slug={post.tags?.[0]} reach="-bottom-3" />
                      </div>
                    </div>
                    <HeadlineSection content={post.title} accentNumbers={false} />
                    {/* Context line: authors_compact already carries the year
                        (e.g. "Friston, 2010"), so published_year is not printed
                        here; it stays in the data for sorting only. */}
                    {(fcStr(post.feed_card, "authors_compact") ||
                      fcStr(post.feed_card, "venue")) && (
                      <p className="px-6 -mt-1 text-xs text-ink-muted font-mono">
                        {[
                          fcStr(post.feed_card, "authors_compact"),
                          fcStr(post.feed_card, "venue"),
                        ].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {fcStr(post.feed_card, "key_finding_one_line") && (
                      <p className="px-6 mt-3 mb-5 font-serif italic text-base text-ink-body leading-relaxed">
                        {unescapeDollar(fcStr(post.feed_card, "key_finding_one_line"))}
                      </p>
                    )}
                    <HeaderMeta post={post} />
                  </div>
                ) : coverFlat ? (
                  /* People cover header (LAYOUT_STANDARD s1/s3): the same flat
                     structure as facts/concepts, opening straight into the page
                     with no slab. The portrait takes the glyph's slot at the right
                     end of the field line; the role kicker is the field label; the
                     name is the single headline; lifespan is the context line and
                     one_line the dek. */
                  <div className="relative">
                    {/* Field line — role kicker only. A cover format has no glyph,
                        so the right end of this line stays intentionally empty. */}
                    <div className="px-6 pt-4">
                      {fcStr(post.feed_card, "role") && (
                        <p className="label-caps text-(--accent)">
                          {fcStr(post.feed_card, "role")}
                        </p>
                      )}
                    </div>
                    {/* Person-head row — the portrait on the left with the name and
                        lifespan stacked to its right, read as one unit and centered
                        against each other the way a biography page introduces someone. */}
                    <div className="px-6 pt-3 pb-4 flex items-center gap-4">
                      {(post.feed_card as { portrait?: { image_url?: string } }).portrait?.image_url && (
                        <div className="shrink-0 w-24 h-24 rounded-full overflow-hidden bg-white/[0.06]">
                          <img
                            src={(post.feed_card as { portrait: { image_url: string } }).portrait.image_url}
                            alt=""
                            className="w-full h-full object-cover object-top"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        {/* Name — the single headline. Styled inline rather than via
                            HeadlineSection only so it can align beside the portrait;
                            the serif scale is kept matched to HeadlineSection by hand,
                            so a HeadlineSection typography change must be mirrored here. */}
                        <h1 className="font-serif text-[2rem] font-medium tracking-tight text-ink leading-snug">
                          {post.title}
                        </h1>
                        {fcStr(post.feed_card, "lifespan") && (
                          <p className="text-ink-muted text-xs font-mono mt-1">
                            {fcStr(post.feed_card, "lifespan")}
                          </p>
                        )}
                      </div>
                    </div>
                    {fcStr(post.feed_card, "one_line") && (
                      <p className="px-6 mb-5 font-serif italic text-base text-ink-body leading-relaxed">
                        {unescapeDollar(fcStr(post.feed_card, "one_line"))}
                      </p>
                    )}
                    <HeaderMeta post={post} />
                  </div>
                ) : coverBooks ? (
                  /* Books cover header (LAYOUT_STANDARD s1/s3): the same flat
                     structure as facts/concepts/people, opening straight into the
                     page with no slab. Unlike people's left portrait, the two-tier
                     cover is centered above the title and presented face-on (the
                     book as an object); a real cover shows its rights-record credit
                     beneath it (BookCover showCredit), a generated cover shows none.
                     The genre is the accent kicker, the title is the single
                     headline, the author is the context line, and one_line is the
                     dek repeated from the card. */
                  <div className="relative">
                    <div className="px-6 pt-3 flex justify-center">
                      <BookCover
                        feedCard={post.feed_card}
                        isUserContent={post.is_user_content}
                        className="rounded-xl overflow-hidden w-32 h-48 bg-white/[0.06]"
                        showCredit
                      />
                    </div>
                    {fcStr(post.feed_card, "genre") && (
                      <div className="px-6 pt-5">
                        <p className="label-caps text-(--accent)">
                          {fcStr(post.feed_card, "genre")}
                        </p>
                      </div>
                    )}
                    <HeadlineSection content={post.title} />
                    {fcStr(post.feed_card, "author") && (
                      <p className="px-6 -mt-1 text-ink-dim text-sm font-medium">
                        {fcStr(post.feed_card, "author")}
                      </p>
                    )}
                    {fcStr(post.feed_card, "one_line") && (
                      <p className="px-6 mt-3 mb-5 font-serif italic text-base text-ink-body leading-relaxed">
                        {unescapeDollar(fcStr(post.feed_card, "one_line"))}
                      </p>
                    )}
                    <HeaderMeta post={post} />
                  </div>
                ) : coverStories ? (
                  /* Stories header (LAYOUT_STANDARD s1/s3): the third card look
                     mirrored at the top of the detail page. A real lead image as
                     a full-width top band when one fits (not a side cover, because
                     headlines are long), else the field glyph keyed on the field
                     (tags[0]) at the right of the field line. The era is the
                     context line above the headline; the serif headline appears
                     once (post.title == feed_card.headline via the seed title
                     derivation); then the meta row. No dek, because the headline
                     is a narrative opening. */
                  <div className="relative">
                    {fcStr(post.feed_card, "lead_image_url") && (
                      /* Slim full-width lead band, matching the card (a touch
                         taller). block so no inline gap; pointer-events-none +
                         draggable=false so the bare image never opens the platform
                         image viewer. object-position keeps the central scene
                         (faces and table) in frame on the slim crop. */
                      <img
                        src={fcStr(post.feed_card, "lead_image_url")}
                        alt=""
                        draggable={false}
                        className="block w-full h-44 object-cover object-[center_38%] pointer-events-none select-none"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                      />
                    )}
                    {/* Field line: the era label (accent) at the left; when there
                        is no lead image, the large category glyph fills the top
                        right as an overlay (LAYOUT_STANDARD s3, mirroring the card).
                        With a lead image the era label stands alone. */}
                    {(fcStr(post.feed_card, "era_label") || !fcStr(post.feed_card, "lead_image_url")) && (
                      <div className="px-6 pt-4">
                        <div className={`relative flex items-center ${!fcStr(post.feed_card, "lead_image_url") ? "min-h-7" : ""}`}>
                          {fcStr(post.feed_card, "era_label") && (
                            <p className="label-caps text-(--accent)">
                              {fcStr(post.feed_card, "era_label")}
                            </p>
                          )}
                          {!fcStr(post.feed_card, "lead_image_url") && (
                            <FieldGlyph slug={post.tags?.[0]} reach="-bottom-3" />
                          )}
                        </div>
                      </div>
                    )}
                    <HeadlineSection content={post.title} />
                    <HeaderMeta post={post} />
                  </div>
                ) : (
                  /* Other formats keep the inset slab header. The glow box stays
                     at container width (a wider box would make the vertical
                     scroller horizontally scrollable) and bleeds only a little
                     vertically, so the floating back circle keeps a near-black
                     backdrop. */
                  <div className="relative">
                    <SlabGlow className="absolute inset-x-0 -inset-y-14" />
                    <div className="mx-3 mb-3 card relative overflow-hidden px-5 py-6">
                      <SlabAccent />
                      {/* Format marker — dot and label carry the accent. */}
                      <div data-no-read className="flex items-center gap-2 mb-4">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-(--accent)" />
                        <span className="text-xs font-mono lowercase tracking-widest text-(--accent)">
                          {style.badge.toLowerCase()}
                        </span>
                      </div>

                      {/* Title */}
                      <h1 className="font-serif text-3xl font-medium text-ink leading-snug mb-1">
                        {post.title}
                      </h1>

                      {/* Creator — round avatar + handle, read from the same
                          author fields as the feed card so the two always match.
                          data-no-read: chrome, not spoken by read-aloud. */}
                      {post.author_username && (
                        <div data-no-read className="flex items-center gap-1.5 mb-4">
                          <Link
                            href={`/profile/${post.author_username}`}
                            className="flex items-center gap-1.5 text-ink-muted text-xs hover:text-ink-body transition-colors"
                          >
                            <Avatar username={post.author_username} avatarUrl={post.author_avatar_url} size={20} />
                            <span>@{post.author_username}</span>
                          </Link>
                          {(post.author_is_verified ?? 0) > 0 && (
                            <VerifiedBadge size={14} level={post.author_is_verified ?? 1} />
                          )}
                        </div>
                      )}

                      {/* Interest tags as floating pills — not spoken */}
                      {post.interests.length > 0 && (
                        <div data-no-read className="flex flex-wrap gap-2">
                          {post.interests.map((name) => (
                            <span
                              key={name}
                              className="px-3 py-1 rounded-full text-xs bg-white/[0.06] text-ink-dim"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sections — the memoized bodySections array (headline filter
                    for flat headers) keeps SectionRenderer's memo effective. */}
                <SectionRenderer
                  sections={bodySections}
                  isUserContent={post.is_user_content}
                  postId={post.id}
                  format={post.format}
                  readingMinutes={post.reading_minutes}
                />
                {post.sections.length === 0 && (
                  // Seeded from the feed cache: the header above is real, the
                  // body is still loading (list payloads strip sections).
                  <div className="px-3 pt-2 flex flex-col gap-3">
                    <div className="stage-pulse card h-40 w-full" />
                    <div className="stage-pulse card h-24 w-3/4" />
                  </div>
                )}
                </div>

                {/* Tags at the end (typographic formats) — small chips near the
                    sources section, the network/filter layer at the foot of the
                    post. The slab header carries its own tags, so this is only for
                    the banner-header formats. */}
                {flatHeader && post.interests.length > 0 && (
                  <div data-no-read className="px-6 pt-2 pb-6 flex flex-wrap gap-2">
                    {post.interests.map((name) => (
                      <span
                        key={name}
                        className="px-3 py-1 rounded-full text-xs bg-white/[0.06] text-ink-dim"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Read Next — server-resolved featured edges (graph_edges.
                    resolved_read_next). Rendered directly; never re-derived here.
                    Defensively capped at 3 even though the server already caps it.
                    Outside the readable region so read-aloud never speaks it. */}
                {(() => {
                  const readNext = (post.read_next ?? []).slice(0, 3)
                  if (readNext.length === 0) return null
                  return (
                    <div data-no-read className="border-t border-edge">
                      <div className="px-6 pt-6 -mb-4">
                        <SectionLabel>Read Next</SectionLabel>
                      </div>
                      <RelatedPostsSection content={readNext} />
                    </div>
                  )
                })()}

                {/* Comments list */}
                <div ref={commentsTopRef} className="px-6">
                  <CommentsSection
                    comments={comments}
                    error={commentsError}
                    currentUsername={user?.username}
                    onDelete={deleteComment}
                    deletingId={deletingId}
                  />
                </div>
              </>
            ) : notFound ? (
              <div className="flex items-center justify-center h-full px-6">
                <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-3">
                  <p className="text-ink font-serif font-medium text-lg">Post not found</p>
                  <p className="text-ink-muted text-sm">It may have been removed or is awaiting review.</p>
                  <button onClick={close} className="btn btn-ghost px-5 py-2">
                    Go back
                  </button>
                </div>
              </div>
            ) : (
              // Loading: pulsing slabs where the header and body will appear.
              <div className="h-full flex flex-col px-3 gap-3">
                <div className="stage-pulse card h-56 w-full" />
                <div className="stage-pulse card h-28 w-3/4" />
              </div>
            )}
          </div>

          {/* Floating pill comment bar — owns the draft state so keystrokes
              re-render the bar alone, never the section tree above it. */}
          <CommentBar
            posting={posting}
            postComment={postComment}
            onPosted={scrollToComments}
            showLike={!!post}
            liked={liked}
            onToggleLike={handleToggleLike}
          />
        </div>
      </div>
    </div>
  )
}
