"use client"

import { use, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { type Post, FORMAT_STYLES } from "@/app/components/PostCard"
import { useWikipediaImage } from "@/app/lib/useWikipediaImage"
import CommentsSection, { type Comment } from "@/app/components/CommentsSection"
import Toast from "@/app/components/Toast"
import { useAuth } from "@/app/lib/auth"
import { apiFetch } from "@/app/lib/api"
import { queueEvent, hasPendingLike, cancelPendingLike } from "@/app/lib/eventQueue"
import { savePost, unsavePost, isPostSaved } from "@/app/lib/savedPosts"
import { likePost, unlikePost, isPostLiked, getCachedLikeCount, setCachedLikeCount, isLikeSent, markLikeSent, unmarkLikeSent } from "@/app/lib/likedPosts"

interface BookDetails {
  author?: string
  publication_year?: number
  core_thesis?: string
  who_should_read?: string
}

interface FactDetails {
  stat?: string
  context?: string
  why_it_matters?: string
  visual_svg?: string
}

interface PersonDetails {
  lifespan?: string
  known_for?: string
  field?: string
  turning_point?: string
  legacy?: string
  wikipedia_url?: string
}

interface ConceptDetails {
  one_line_definition?: string
  concrete_example?: string
  how_to_apply?: string
  visual_svg?: string
}

interface QuestionDetails {
  the_question?: string
  framing?: string
  perspectives?: string[]
}

interface StoryDetails {
  setting?: string
  narrative?: string
  the_twist?: string
  aftermath?: string
}

type Format = keyof typeof FORMAT_STYLES

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user } = useAuth()

  const [post, setPost] = useState<Post | null>(null)
  const [closing, setClosing] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [stickyDraft, setStickyDraft] = useState("")
  const [posting, setPosting] = useState(false)
  const [liked, setLiked] = useState(() => isPostLiked(Number(id)))
  const [likesCount, setLikesCount] = useState(() =>
    getCachedLikeCount(Number(id)) ?? (isPostLiked(Number(id)) ? 1 : 0)
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
        if (!data) return
        setPost(data)
        setSaved(isPostSaved(data.id))
      })
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

  const pd = post ? (post.details ?? {}) as PersonDetails : {} as PersonDetails
  const fd = post ? (post.details ?? {}) as FactDetails   : {} as FactDetails
  const bd = post ? (post.details ?? {}) as BookDetails   : {} as BookDetails
  const cd = post ? (post.details ?? {}) as ConceptDetails : {} as ConceptDetails
  const qd = post ? (post.details ?? {}) as QuestionDetails : {} as QuestionDetails
  const sd = post ? (post.details ?? {}) as StoryDetails  : {} as StoryDetails

  const { imageUrl: wikiOriginal } = useWikipediaImage(
    post?.format === "people" && !post.image_url ? pd.wikipedia_url : null,
    "original"
  )
  const personImageUrl = post?.image_url ?? wikiOriginal
  const personAttribution = post?.image_url
    ? post.image_attribution
    : wikiOriginal
    ? "Via Wikimedia Commons"
    : null

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
  }, []) // runs once; close() only calls stable setters

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
        await navigator.share({ title: post.title, text: post.hook ?? "", url })
      } else {
        await navigator.clipboard.writeText(url)
        setToastVisible(true)
        setTimeout(() => setToastVisible(false), 2000)
      }
    } catch {
      // User cancelled share or clipboard failed
    }
  }

  const style = post
    ? FORMAT_STYLES[post.format as Format] ?? {
        label: post.format.toUpperCase(),
        dot: "bg-zinc-400",
        text: "text-zinc-400",
        glow: "from-zinc-400/40",
        radial: "rgba(161,161,170,0.09)",
        accent: "#a1a1aa",
      }
    : null

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
            className="flex-1 overflow-y-auto px-6 pt-16 pb-24 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          >
            {post && style ? (
              <>
                {/* Format badge */}
                <div className="flex items-center gap-2 mb-6">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                  <span className={`text-xs font-semibold tracking-widest ${style.text}`}>
                    {style.label}
                  </span>
                </div>

                {/* Attribution */}
                <div className="flex items-center gap-1 mb-2">
                  {post.is_user_content && post.author_username ? (
                    <span className="flex items-center gap-1 text-zinc-500 text-xs">
                      Submitted by{" "}
                      <Link href={`/profile/${post.author_username}`} className="hover:text-zinc-300 transition-colors">
                        @{post.author_username}
                      </Link>
                      {post.author_is_verified && (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Verified" className="flex-shrink-0">
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

                {/* Image */}
                {post.format === "people" && personImageUrl && (
                  <div className="flex flex-col items-center mb-6 gap-2">
                    <div
                      className="rounded-full overflow-hidden"
                      style={{ width: 96, height: 96, background: `${style.accent}26` }}
                    >
                      <img
                        src={personImageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                      />
                    </div>
                    {personAttribution && (
                      <p className="text-zinc-600 text-xs">{personAttribution}</p>
                    )}
                  </div>
                )}
                {post.format === "books" && post.image_url && (
                  <div className="flex flex-col items-center mb-6 gap-2">
                    <div
                      className="rounded-lg overflow-hidden"
                      style={{ maxWidth: 200, background: `${style.accent}26` }}
                    >
                      <img
                        src={post.image_url}
                        alt=""
                        className="object-cover"
                        style={{ maxWidth: 200 }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                      />
                    </div>
                    {post.image_attribution && (
                      <p className="text-zinc-600 text-xs">{post.image_attribution}</p>
                    )}
                  </div>
                )}
                {post.image_url && post.format !== "books" && post.format !== "people" && (
                  <div
                    className="w-full rounded-xl overflow-hidden mb-6"
                    style={{ maxHeight: 240, background: `${style.accent}26` }}
                  >
                    <img
                      src={post.image_url}
                      alt=""
                      className="w-full object-cover"
                      style={{ maxHeight: 240 }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                    />
                  </div>
                )}

                {/* Format-specific meta block */}
                {post.format === "facts" && fd.stat && (
                  <p
                    className="text-5xl font-black text-center mb-4 leading-none"
                    style={{ color: style.accent }}
                  >
                    {fd.stat}
                  </p>
                )}
                {post.format === "people" && (pd.lifespan || pd.field || pd.known_for) && (
                  <p className="text-zinc-400 text-sm mb-4">
                    {[pd.lifespan, pd.field, pd.known_for].filter(Boolean).join(" · ")}
                  </p>
                )}
                {post.format === "books" && (bd.author || bd.publication_year || post.source) && (
                  <p className="text-zinc-400 text-sm mb-4">
                    {[bd.author, bd.publication_year, post.source].filter(Boolean).join(" · ")}
                  </p>
                )}
                {post.format === "concepts" && cd.one_line_definition && (
                  <div
                    className="rounded-xl px-4 py-3 mb-4"
                    style={{ background: `${style.accent}1a` }}
                  >
                    <p className="text-sm font-medium" style={{ color: style.accent }}>
                      {cd.one_line_definition}
                    </p>
                  </div>
                )}
                {post.format === "questions" && qd.the_question && (
                  <p className="text-xl italic text-zinc-200 mb-4 leading-snug">
                    {qd.the_question}
                  </p>
                )}
                {post.format === "stories" && sd.setting && (
                  <p className="text-zinc-500 text-sm italic mb-4">{sd.setting}</p>
                )}

                {/* Title */}
                <h1 className="text-2xl font-bold text-white leading-snug mb-4">
                  {post.title}
                </h1>

                {/* Hook */}
                {post.hook && (
                  <p className="text-lg text-zinc-200 leading-relaxed mb-6">{post.hook}</p>
                )}

                {/* SVG visual */}
                {(cd.visual_svg || fd.visual_svg) && (() => {
                  const svgContent = (cd.visual_svg ?? fd.visual_svg)!
                  return post.is_user_content
                    ? (
                      <img
                        src={`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgContent)))}`}
                        alt=""
                        className="w-full max-w-[360px] mx-auto my-6 block"
                      />
                    ) : (
                      /* seed/official SVG — controlled content, dangerouslySetInnerHTML intentional */
                      <div
                        className="w-full max-w-[360px] mx-auto my-6"
                        style={{ color: "#e4e4e7" }}
                        dangerouslySetInnerHTML={{ __html: svgContent }}
                      />
                    )
                })()}

                {/* Key points or body fallback */}
                {post.key_points ? (
                  <div className="flex flex-col gap-4 mb-6">
                    {post.key_points.map((point, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <span
                          className="shrink-0 text-base mt-0.5"
                          style={{ color: style.accent }}
                        >
                          ·
                        </span>
                        <p className="text-zinc-300 text-base leading-relaxed">{point}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-300 text-base leading-relaxed mb-6">{post.body}</p>
                )}

                {/* Format-specific extra sections */}
                {post.format === "facts" && (
                  <>
                    {fd.context && (
                      <p className="text-zinc-400 text-base leading-relaxed mb-4">{fd.context}</p>
                    )}
                    {fd.why_it_matters && (
                      <div className="bg-zinc-900/60 rounded-xl px-4 py-3 mb-6">
                        <p
                          className="text-sm font-semibold mb-1"
                          style={{ color: style.accent }}
                        >
                          Why it matters
                        </p>
                        <p className="text-zinc-300 text-base leading-relaxed">
                          {fd.why_it_matters}
                        </p>
                      </div>
                    )}
                  </>
                )}
                {post.format === "concepts" && (
                  <>
                    {cd.concrete_example && (
                      <div className="bg-zinc-900/60 rounded-xl px-4 py-3 mb-4">
                        <p className="text-zinc-400 text-xs font-semibold tracking-wider mb-2 uppercase">
                          Real-world example
                        </p>
                        <p className="text-zinc-300 text-base leading-relaxed">
                          {cd.concrete_example}
                        </p>
                      </div>
                    )}
                    {cd.how_to_apply && (
                      <p className="text-zinc-400 text-base leading-relaxed mb-6">
                        {cd.how_to_apply}
                      </p>
                    )}
                  </>
                )}
                {post.format === "questions" && (
                  <>
                    {qd.framing && (
                      <p className="text-zinc-400 text-base leading-relaxed mb-4">{qd.framing}</p>
                    )}
                    {qd.perspectives && qd.perspectives.length > 0 && (
                      <div className="flex flex-col gap-4 mb-6">
                        {qd.perspectives.map((perspective, i) => (
                          <div key={i} className="bg-zinc-900/60 rounded-xl px-4 py-3">
                            <p className="text-zinc-400 text-xs font-semibold tracking-wider mb-1 uppercase">
                              Perspective {i + 1}
                            </p>
                            <p className="text-zinc-300 text-base leading-relaxed">
                              {perspective}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {post.format === "stories" && (
                  <>
                    {sd.narrative && (
                      <p className="text-zinc-300 text-base leading-relaxed mb-4">
                        {sd.narrative}
                      </p>
                    )}
                    {sd.the_twist && (
                      <div className="bg-zinc-900/60 rounded-xl px-4 py-3 mb-4">
                        <p className="text-zinc-400 text-xs font-semibold tracking-wider mb-2 uppercase">
                          The twist
                        </p>
                        <p className="text-zinc-300 text-base leading-relaxed">{sd.the_twist}</p>
                      </div>
                    )}
                    {sd.aftermath && (
                      <p className="text-zinc-400 text-base leading-relaxed mb-6">
                        {sd.aftermath}
                      </p>
                    )}
                  </>
                )}
                {post.format === "books" && (
                  <>
                    {bd.core_thesis && (
                      <div className="bg-zinc-900/60 rounded-xl px-4 py-3 mb-4">
                        <p className="text-zinc-400 text-xs font-semibold tracking-wider mb-2 uppercase">
                          Core thesis
                        </p>
                        <p className="text-zinc-300 text-base leading-relaxed">{bd.core_thesis}</p>
                      </div>
                    )}
                    {bd.who_should_read && (
                      <p className="text-zinc-400 text-base leading-relaxed mb-6">
                        {bd.who_should_read}
                      </p>
                    )}
                  </>
                )}
                {post.format === "people" && (
                  <>
                    {pd.turning_point && (
                      <p className="text-zinc-300 text-base leading-relaxed mb-4">
                        {pd.turning_point}
                      </p>
                    )}
                    {pd.legacy && (
                      <p className="text-zinc-400 text-base leading-relaxed mb-6">{pd.legacy}</p>
                    )}
                  </>
                )}

                {/* Takeaway */}
                {post.takeaway && (
                  <div
                    className="border-l-2 px-4 py-3 my-6"
                    style={{ borderColor: style.accent }}
                  >
                    <p className="text-zinc-300 italic text-base leading-relaxed">
                      {post.takeaway}
                    </p>
                  </div>
                )}

                {/* Source link */}
                {(post.source_url || post.source) && (
                  <div className="mb-6">
                    {post.source_url ? (
                      <a
                        href={post.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-500 text-sm underline"
                      >
                        {post.source ?? "Source"}
                      </a>
                    ) : (
                      <p className="text-zinc-500 text-sm">{post.source}</p>
                    )}
                  </div>
                )}

                {/* Interest tags */}
                <div className="flex flex-wrap gap-2">
                  {post.interests.map((name) => (
                    <span
                      key={name}
                      className="px-3 py-1 rounded-full text-xs bg-zinc-800 text-zinc-400"
                    >
                      {name}
                    </span>
                  ))}
                </div>

                {/* Comments list */}
                <CommentsSection
                  comments={comments}
                  currentUsername={user?.username}
                  onDelete={handleDelete}
                  deletingId={deletingId}
                />

              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <span className="text-zinc-600 text-sm">Loading...</span>
              </div>
            )}
          </div>

          {/* Sticky comment bar with integrated action buttons */}
          <div className="flex-none border-t border-zinc-800/50 bg-zinc-950/95 backdrop-blur-md">
            <div className="flex items-center gap-2 px-3 py-2">
              {/* Left: comment input or sign-in prompt */}
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

              {/* Right: like button only */}
              {post && (
                <button
                  onClick={handleToggleLike}
                  className="w-11 h-11 flex items-center justify-center"
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
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
