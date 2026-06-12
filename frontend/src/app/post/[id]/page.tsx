"use client"

import { use, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { formatStyle } from "@/lib/formats"
import { fcStr, type Post } from "@/types/post"
import SectionRenderer from "@/components/SectionRenderer"
import CommentsSection, { type Comment } from "@/app/components/CommentsSection"
import VerifiedBadge from "@/components/VerifiedBadge"
import { useAuth } from "@/app/lib/auth"
import { apiFetch } from "@/app/lib/api"
import { queueEvent, hasPendingLike, cancelPendingLike } from "@/app/lib/eventQueue"
import { likePost, unlikePost, isPostLiked, getCachedLikeCount, setCachedLikeCount, isLikeSent, markLikeSent, unmarkLikeSent } from "@/app/lib/likedPosts"
import { updatePostInFeedCaches } from "@/app/lib/swr"

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

  function close() {
    if (isClosingRef.current) return
    isClosingRef.current = true
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

          {/* Scrollable content */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto pt-16 pb-24 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          >
            {post && style ? (
              <>
                {/* Header — frosted slab inset from the edges */}
                <div className="mx-3 mb-3 card px-5 py-6">
                  {/* Format marker — the only accent touch */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-(--accent)" />
                    <span className="text-xs font-mono lowercase tracking-widest text-ink-muted">
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

                  {/* Attribution */}
                  <div className="flex items-center gap-1 mb-4">
                    {post.is_user_content && post.author_username ? (
                      <span className="flex items-center gap-1 text-ink-muted text-xs">
                        Submitted by{" "}
                        <Link href={`/profile/${post.author_username}`} className="hover:text-ink-body transition-colors">
                          @{post.author_username}
                        </Link>
                        {post.author_is_verified != null && post.author_is_verified > 0 && <VerifiedBadge size={16} level={post.author_is_verified} />}
                      </span>
                    ) : !post.is_user_content ? (
                      <>
                        <span className="text-ink-muted text-xs">Deepscroll</span>
                        <VerifiedBadge size={12} variant="official" />
                      </>
                    ) : null}
                  </div>

                  {/* Interest tags as floating pills */}
                  {post.interests.length > 0 && (
                    <div className="flex flex-wrap gap-2">
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

                {/* Sections */}
                <SectionRenderer
                  sections={post.sections}
                  isUserContent={post.is_user_content}
                  postId={post.id}
                />

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
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
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
                <svg
                  viewBox="0 0 24 24"
                  fill={liked ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth={liked ? 0 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
