"use client"

import { use, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { formatStyle } from "@/lib/formats"
import { fcStr, type Post } from "@/types/post"
import SectionRenderer from "@/components/SectionRenderer"
import CommentsSection, { type Comment } from "@/app/components/CommentsSection"
import Toast from "@/app/components/Toast"
import { useAuth } from "@/app/lib/auth"
import { apiFetch } from "@/app/lib/api"
import { queueEvent, hasPendingLike, cancelPendingLike } from "@/app/lib/eventQueue"
import { savePost, unsavePost, isPostSaved } from "@/app/lib/savedPosts"
import { likePost, unlikePost, isPostLiked, getCachedLikeCount, setCachedLikeCount, isLikeSent, markLikeSent, unmarkLikeSent } from "@/app/lib/likedPosts"

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
  const [saved, setSaved] = useState(false)
  const [animatingSave, setAnimatingSave] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const stickyInputRef     = useRef<HTMLInputElement>(null)
  const isClosingRef       = useRef(false)
  const likeInteractedRef  = useRef(false)

  useEffect(() => {
    apiFetch(`/api/posts/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Post | null) => {
        if (!data) {
          setNotFound(true)
          return
        }
        setPost(data)
        setSaved(isPostSaved(data.id))
        if (!likeInteractedRef.current) {
          setLikesCount(getCachedLikeCount(data.id) ?? data.like_count)
        }
      })
      .catch(() => setNotFound(true))
    apiFetch(`/api/posts/${id}/comments`)
      .then((r) => r.json())
      .then(setComments)
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

  function handleSaveToggle() {
    if (!post) return
    const next = !saved
    setSaved(next)
    if (next) {
      savePost(post.id)
      setAnimatingSave(true)
    } else {
      unsavePost(post.id)
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

  async function handleShare() {
    if (!post) return
    const url = window.location.origin + "/post/" + post.id
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, text: fcStr(post.feed_card, "essence"), url })
      } else {
        await navigator.clipboard.writeText(url)
        setToastVisible(true)
        setTimeout(() => setToastVisible(false), 2000)
      }
    } catch {
      // User cancelled share or clipboard failed
    }
  }

  const style = post ? formatStyle(post.format) : null

  return (
    <div className="h-[100dvh] bg-zinc-950 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative overflow-hidden">
        <div
          className="absolute inset-0 bg-zinc-950 flex flex-col"
          style={{
            animation: closing
              ? "slideDown 250ms ease-in forwards"
              : "slideUp 300ms ease-out forwards",
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
            className="absolute top-4 left-4 z-10 w-11 h-11 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
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

          <Toast message="Link copied!" visible={toastVisible} />

          {/* Scrollable content */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto pt-16 pb-24 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          >
            {post && style ? (
              <>
                {/* Header: cover + title + author */}
                <div className="px-6 pb-2">
                  {/* Format badge */}
                  <div className="flex items-center gap-2 mb-5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                    <span className={`text-xs font-semibold tracking-widest ${style.text}`}>
                      {style.badge}
                    </span>
                  </div>

                  {/* Attribution */}
                  <div className="flex items-center gap-1 mb-4">
                    {post.is_user_content && post.author_username ? (
                      <span className="flex items-center gap-1 text-zinc-500 text-xs">
                        Submitted by{" "}
                        <Link href={`/profile/${post.author_username}`} className="hover:text-zinc-300 transition-colors">
                          @{post.author_username}
                        </Link>
                        {post.author_is_verified && (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-label="Verified" className="flex-shrink-0">
                            <circle cx="8" cy="8" r="8" fill="#60a5fa"/>
                            <path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                    ) : !post.is_user_content ? (
                      <>
                        <span className="text-zinc-500 text-xs">Deepscroll</span>
                        <svg viewBox="0 0 16 16" className="w-3 h-3 text-violet-400" fill="currentColor">
                          <circle cx="8" cy="8" r="8" />
                          <path d="M5 8.5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      </>
                    ) : null}
                  </div>

                  {/* Books cover */}
                  {post.format === "books" && fcStr(post.feed_card, "cover_url") && (
                    <div className="flex justify-center mb-5">
                      <div className="rounded-xl overflow-hidden shadow-xl w-32 h-48 bg-zinc-800">
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
                  <h1 className="text-2xl font-bold text-white leading-snug mb-1">
                    {post.title}
                  </h1>

                  {/* Author (Books) */}
                  {post.format === "books" && fcStr(post.feed_card, "author") && (
                    <p className="text-amber-400 text-sm font-medium mb-4">
                      {fcStr(post.feed_card, "author")}
                    </p>
                  )}

                  {/* Interest tags */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    {post.interests.map((name) => (
                      <span
                        key={name}
                        className="px-3 py-1 rounded-full text-xs bg-zinc-800 text-zinc-400"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Sections */}
                <SectionRenderer
                  sections={post.sections}
                  isUserContent={post.is_user_content}
                  format={post.format}
                />

                {/* Comments list */}
                <div className="px-6 pt-4">
                  <CommentsSection
                    comments={comments}
                    currentUsername={user?.username}
                    onDelete={handleDelete}
                    deletingId={deletingId}
                  />
                </div>
              </>
            ) : notFound ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
                <p className="text-white font-semibold">Post not found</p>
                <p className="text-zinc-500 text-sm">It may have been removed or is awaiting review.</p>
                <button onClick={close} className="text-zinc-400 text-sm underline">
                  Go back
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <span className="text-zinc-600 text-sm">Loading...</span>
              </div>
            )}
          </div>

          {/* Sticky comment bar */}
          <div className="flex-none border-t border-zinc-800/50 bg-zinc-950/95 backdrop-blur-md">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                {user ? (
                  <form onSubmit={handleStickySubmit}>
                    <input
                      ref={stickyInputRef}
                      value={stickyDraft}
                      onChange={(e) => setStickyDraft(e.target.value)}
                      placeholder="Add a comment..."
                      maxLength={2000}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-full px-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                    />
                    <button
                      type="submit"
                      disabled={!stickyDraft.trim() || posting}
                      className="sr-only"
                    >
                      Post
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-zinc-500 py-1">
                    <Link
                      href="/login"
                      className="text-zinc-400 hover:text-white underline transition-colors"
                    >
                      Sign in
                    </Link>{" "}
                    to comment
                  </p>
                )}
              </div>

              {/* Like + save + share row */}
              {post && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleToggleLike}
                    className="w-10 h-10 flex flex-col items-center justify-center"
                    aria-label={liked ? "Unlike" : "Like"}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill={liked ? "rgb(244,63,94)" : "none"}
                      stroke={liked ? "none" : "currentColor"}
                      strokeWidth={liked ? 0 : 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-5 h-5 text-zinc-400"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    <span className="text-[10px] text-zinc-400 leading-none">{likesCount}</span>
                  </button>

                  <button
                    onClick={handleSaveToggle}
                    className="w-10 h-10 flex items-center justify-center"
                    aria-label={saved ? "Unsave" : "Save"}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill={saved ? "rgb(251,191,36)" : "none"}
                      stroke={saved ? "none" : "currentColor"}
                      strokeWidth={saved ? 0 : 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`w-5 h-5 text-zinc-400 ${animatingSave ? "heart-pop" : ""}`}
                      onAnimationEnd={() => setAnimatingSave(false)}
                    >
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>

                  <button
                    onClick={handleShare}
                    className="w-10 h-10 flex items-center justify-center"
                    aria-label="Share"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-5 h-5 text-zinc-400"
                    >
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
