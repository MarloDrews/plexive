"use client"

import { use, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { formatStyle } from "@/lib/formats"
import { fcNum, fcStr, type CardVisual, type Post } from "@/types/post"
import SectionRenderer from "@/components/SectionRenderer"
import SectionLabel from "@/components/SectionLabel"
import HeadlineSection from "@/components/sections/HeadlineSection"
import RelatedPostsSection from "@/components/sections/RelatedPostsSection"
import CommentsSection, { type Comment } from "@/app/components/CommentsSection"
import { SlabAccent, SlabGlow } from "@/app/components/PostCard"
import Avatar from "@/components/Avatar"
import DotScale from "@/components/DotScale"
import SvgBlock from "@/components/SvgBlock"
import VerifiedBadge from "@/components/VerifiedBadge"
import { ArrowUpIcon, HeartIcon, PauseIcon, SpeakerIcon, StopIcon } from "@/app/components/icons"
import { useReadAloud } from "@/lib/readAloud/useReadAloud"
import { consumeAutoRead } from "@/lib/readAloud/autostart"
import { useAuth } from "@/app/lib/auth"
import { apiFetch } from "@/app/lib/api"
import { queueEvent, hasPendingLike, cancelPendingLike } from "@/app/lib/eventQueue"
import { likePost, unlikePost, isPostLiked, getCachedLikeCount, setCachedLikeCount, isLikeSent, markLikeSent, unmarkLikeSent } from "@/app/lib/likedPosts"
import { updatePostInFeedCaches } from "@/app/lib/swr"

// Small field glyph at the right end of the facts field line, mirroring the
// feed card (~28px tall, aspect preserved). The glyph belongs to the field, not
// the post (a future field-to-glyph set, see ROADMAP.md); for now it renders the
// inline card_visual.svg (compact viewBox). SVG security split handled by SvgBlock.
function FieldGlyph({ cv, isUserContent }: { cv: CardVisual | undefined; isUserContent: boolean }) {
  if (!cv?.svg) return null
  return (
    <SvgBlock
      svg={cv.svg}
      isUserContent={isUserContent}
      className="shrink-0 [&_svg]:h-7 [&_svg]:w-auto [&_img]:h-7 [&_img]:w-auto"
    />
  )
}

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()

  const [post, setPost] = useState<Post | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [closing, setClosing] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [stickyDraft, setStickyDraft] = useState("")
  const [posting, setPosting] = useState(false)
  const [liked, setLiked] = useState(() => isPostLiked(Number(id)))
  const [likesCount, setLikesCount] = useState(() =>
    getCachedLikeCount(Number(id)) ?? 0
  )

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const readableRef        = useRef<HTMLDivElement>(null)
  const commentsTopRef     = useRef<HTMLDivElement>(null)
  const stickyInputRef     = useRef<HTMLInputElement>(null)
  const isClosingRef       = useRef(false)
  const likeInteractedRef  = useRef(false)
  const commentsLoadedRef  = useRef(false)

  // Feed lists are cached for the session; keep the cached comment_count in
  // sync whenever the comment list changes here (add, delete, initial load).
  useEffect(() => {
    if (!commentsLoadedRef.current) return
    updatePostInFeedCaches(Number(id), { comment_count: comments.length })
  }, [comments.length, id])

  useEffect(() => {
    apiFetch(`/api/posts/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Post | null) => {
        if (!data) {
          setNotFound(true)
          return
        }
        setPost(data)
        if (!likeInteractedRef.current) {
          setLikesCount(getCachedLikeCount(data.id) ?? data.like_count)
        }
      })
      .catch(() => setNotFound(true))
    apiFetch(`/api/posts/${id}/comments`)
      .then((r) => r.json())
      .then((data: Comment[]) => {
        setComments(data)
        commentsLoadedRef.current = true
      })
      .catch(() => {})
    apiFetch(`/api/posts/${id}/likes`)
      .then((r) => r.json())
      .then((d) => {
        if (!likeInteractedRef.current) {
          const liked = isPostLiked(Number(id))
          const sent = isLikeSent(Number(id))
          const onServer = sent && !hasPendingLike(Number(id))
          const adjust = (liked && !onServer ? 1 : 0) - (!liked && sent ? 1 : 0)
          const display = d.count + adjust
          setLikesCount(display)
          setCachedLikeCount(Number(id), display)
        }
      })
      .catch(() => {})
  }, [id])

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
    likeInteractedRef.current = true
    if (isPostLiked(post.id)) {
      unlikePost(post.id)
      setLiked(false)
      setLikesCount((prev) => { const n = prev - 1; setCachedLikeCount(post.id, n); return n })
      if (hasPendingLike(post.id)) {
        cancelPendingLike(post.id)
        unmarkLikeSent(post.id)
      }
    } else {
      likePost(post.id)
      setLiked(true)
      setLikesCount((prev) => { const n = prev + 1; setCachedLikeCount(post.id, n); return n })
      if (!isLikeSent(post.id)) {
        markLikeSent(post.id)
        queueEvent({ post_id: post.id, event_type: "like" })
      }
    }
  }

  async function handleDelete(commentId: number) {
    if (deletingId !== null) return
    setDeletingId(commentId)
    try {
      const r = await apiFetch(`/api/comments/${commentId}`, { method: "DELETE" })
      if (r.ok) setComments((prev) => prev.filter((c) => c.id !== commentId))
    } finally {
      setDeletingId(null)
    }
  }

  async function handlePostComment(body: string) {
    if (posting) return
    setPosting(true)
    try {
      const r = await apiFetch(`/api/posts/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      })
      if (!r.ok) return
      const created: Comment = await r.json()
      setComments((prev) => [created, ...prev])
      // Scroll the comments heading into view so the user sees their new comment.
      setTimeout(() => {
        commentsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 50)
    } finally {
      setPosting(false)
    }
  }

  async function handleStickySubmit(e: React.FormEvent) {
    e.preventDefault()
    const body = stickyDraft.trim()
    if (!body) return
    setStickyDraft("")
    await handlePostComment(body)
  }

  const style = post ? formatStyle(post.format) : null

  return (
    <div className="h-[100dvh] bg-surface-0 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative overflow-hidden">
        <div
          className="absolute inset-0 bg-surface-0 flex flex-col z-40"
          // --accent drives every format-colored detail in the header and sections.
          style={{
            animation: closing
              ? "slideDown 250ms ease-in forwards"
              : "slideUp 300ms ease-out forwards",
            ["--accent" as string]: style?.accent,
          }}
        >
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); }
              to   { transform: translateY(0); }
            }
            @keyframes slideDown {
              from { transform: translateY(0); }
              to   { transform: translateY(100%); }
            }
            @media (prefers-reduced-motion: reduce) {
              * { animation-duration: 0ms !important; }
            }
          `}</style>

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
              centered between the back and audio controls. Facts uses the banner
              header, where the format lives here rather than in a slab. */}
          {post && style && post.format === "facts" && (
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
                {post.format === "facts" ? (
                  /* Facts header per LAYOUT_STANDARD: a field line (field label
                     left, small glyph at its right end, same as the card), the
                     serif headline once, then the meta row. The format label
                     lives in the top bar; the headline section is filtered out of
                     the body below so it never doubles. */
                  <div className="relative">
                    <div className="px-6 pt-4 flex items-start justify-between gap-3">
                      {fcStr(post.feed_card, "field") && (
                        <p className="label-caps text-(--accent)">
                          {fcStr(post.feed_card, "field")}
                        </p>
                      )}
                      <FieldGlyph
                        cv={(post.feed_card as { card_visual?: CardVisual }).card_visual}
                        isUserContent={post.is_user_content}
                      />
                    </div>
                    <HeadlineSection content={post.title} />
                    {/* Meta row — round avatar + creator, reading time,
                        difficulty. Reads the same author fields as the feed
                        card footer, so the two always match. */}
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
                        {fcNum(post.feed_card, "post_reading_time_min") > 0 && (
                          <span className="text-[11px] font-mono text-ink-muted leading-none">
                            {fcNum(post.feed_card, "post_reading_time_min")} min
                          </span>
                        )}
                      </span>
                    </div>
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

                      {/* Books cover */}
                      {post.format === "books" && fcStr(post.feed_card, "cover_url") && (
                        <div className="flex justify-center mb-5">
                          <div className="rounded-xl overflow-hidden w-32 h-48 bg-white/[0.06]">
                            <img
                              src={fcStr(post.feed_card, "cover_url")}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Title */}
                      <h1 className="font-serif text-3xl font-medium text-ink leading-snug mb-1">
                        {post.title}
                      </h1>

                      {/* Author (Books) */}
                      {post.format === "books" && fcStr(post.feed_card, "author") && (
                        <p className="text-ink-dim text-sm font-medium mb-3">
                          {fcStr(post.feed_card, "author")}
                        </p>
                      )}

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

                {/* Sections — for facts the headline now lives in the header
                    above, so drop the headline section to avoid doubling it. */}
                <SectionRenderer
                  sections={
                    post.format === "facts"
                      ? post.sections.filter((s) => s.type !== "headline")
                      : post.sections
                  }
                  isUserContent={post.is_user_content}
                  postId={post.id}
                />
                </div>

                {/* Tags at the end (facts) — small chips near the sources
                    section, the network/filter layer at the foot of the post. */}
                {post.format === "facts" && post.interests.length > 0 && (
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
                    currentUsername={user?.username}
                    onDelete={handleDelete}
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

          {/* Floating pill comment bar — detached from every edge, sits above
              the bottom nav (page z-40 > nav z-30); safe-area aware. */}
          <div
            className="absolute left-3 right-3 z-10 rounded-full backdrop-blur-xl bg-white/[0.06] px-2 py-1.5 flex items-center gap-1.5"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
          >
            <div className="flex-1 min-w-0">
              {user ? (
                <form onSubmit={handleStickySubmit} className="flex items-center gap-1.5">
                  <input
                    ref={stickyInputRef}
                    value={stickyDraft}
                    onChange={(e) => setStickyDraft(e.target.value)}
                    placeholder="Add a comment..."
                    maxLength={2000}
                    className="flex-1 min-w-0 h-11 rounded-full bg-white/[0.06] px-4 text-sm text-ink placeholder:text-ink-muted"
                  />
                  <button
                    type="submit"
                    disabled={!stickyDraft.trim() || posting}
                    aria-label="Post comment"
                    className={`w-11 h-11 shrink-0 rounded-full bg-white/[0.10] flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-95 disabled:opacity-45 disabled:cursor-default ${
                      stickyDraft.trim() && !posting ? "text-ink" : "text-ink-muted"
                    }`}
                  >
                    <ArrowUpIcon className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <p className="text-sm text-ink-muted px-3 py-2 whitespace-nowrap overflow-hidden text-ellipsis">
                  <Link
                    href="/login"
                    className="text-ink-dim hover:text-lamp underline transition-colors"
                  >
                    Sign in
                  </Link>{" "}
                  to comment
                </p>
              )}
            </div>

            {/* Like circle — the bar carries only comment + like */}
            {post && (
              <button
                onClick={handleToggleLike}
                aria-label={liked ? "Unlike" : "Like"}
                className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-95 ${
                  liked ? "bg-like/10 text-like" : "bg-white/[0.06] text-ink-dim"
                }`}
              >
                <HeartIcon filled={liked} className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
