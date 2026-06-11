"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import CommentsBottomSheet from "./CommentsBottomSheet"
import Toast from "./Toast"
import { queueEvent, hasPendingLike, cancelPendingLike } from "@/app/lib/eventQueue"
import { apiFetch } from "@/app/lib/api"
import { savePost, unsavePost, isPostSaved } from "@/app/lib/savedPosts"
import { likePost, unlikePost, isPostLiked, getCachedLikeCount, setCachedLikeCount, isLikeSent, markLikeSent, unmarkLikeSent } from "@/app/lib/likedPosts"
import { fcNum, fcStr, type Post } from "@/types/post"
import { formatStyle } from "@/lib/formats"

export type { Post }

const MIN_DWELL_MS = 500

// Difficulty dots take the per-format ink from the card's --accent variable.
function DotScale({ value }: { value: 1 | 2 | 3 }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`inline-block w-1.5 h-1.5 rounded-full ${i <= value ? "bg-(--accent)" : "bg-surface-3"}`}
        />
      ))}
    </span>
  )
}

// Teaser bullet list shared by every format card.
function Teasers({ items }: { items: string[] }) {
  return (
    <div className="mt-2 space-y-1.5">
      {items.map((teaser, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="text-(--accent) text-sm mt-0.5 shrink-0">&mdash;</span>
          <span className="text-sm text-ink-dim leading-snug">{teaser}</span>
        </div>
      ))}
    </div>
  )
}

export default function PostCard({ post, activeTabId }: { post: Post; activeTabId: string }) {
  const router = useRouter()
  const cardRef           = useRef<HTMLDivElement>(null)
  const viewStartRef      = useRef<number | null>(null)
  const lastTapRef        = useRef<number>(0)
  const navTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const likeInteractedRef = useRef(false)

  const [visible, setVisible] = useState(false)
  const [liked, setLiked] = useState(() => isPostLiked(post.id))
  const [likesCount, setLikesCount] = useState(() =>
    getCachedLikeCount(post.id) ?? post.like_count
  )
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
    apiFetch(`/api/posts/${post.id}/likes`)
      .then((r) => r.json())
      .then((d) => {
        if (!likeInteractedRef.current) {
          const liked = isPostLiked(post.id)
          const sent = isLikeSent(post.id)
          const onServer = sent && !hasPendingLike(post.id)
          const adjust = (liked && !onServer ? 1 : 0) - (!liked && sent ? 1 : 0)
          const display = d.count + adjust
          setLikesCount(display)
          setCachedLikeCount(post.id, display)
        }
      })
      .catch(() => {})
  }, [post.id])

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
          setLiked(isPostLiked(post.id))
          const cached = getCachedLikeCount(post.id)
          if (cached !== null) setLikesCount(cached)
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
  }, [post.id])

  function handleLike() {
    if (isPostLiked(post.id)) return
    likeInteractedRef.current = true
    likePost(post.id)
    setLiked(true)
    setLikesCount((prev) => { const n = prev + 1; setCachedLikeCount(post.id, n); return n })
    setAnimatingLike(true)
    if (!isLikeSent(post.id)) {
      markLikeSent(post.id)
      queueEvent({ post_id: post.id, event_type: "like" })
    }
    setShowHeartAnim(true)
  }

  function handleUnlike() {
    if (!isPostLiked(post.id)) return
    likeInteractedRef.current = true
    unlikePost(post.id)
    setLiked(false)
    setLikesCount((prev) => { const n = prev - 1; setCachedLikeCount(post.id, n); return n })
    if (hasPendingLike(post.id)) {
      cancelPendingLike(post.id)
      unmarkLikeSent(post.id)
    }
  }

  function handleToggleLike() {
    if (liked) handleUnlike()
    else handleLike()
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
      if (!liked) handleLike()
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
      className="h-[100dvh] relative overflow-hidden shrink-0 snap-start [scroll-snap-stop:always] flex flex-col bg-surface-0 pl-5 pr-5 pt-12 pb-8"
    >
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

      {/* Format indicator row */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`}
            style={{ boxShadow: `0 0 8px 3px ${style.accent}dd, 0 0 20px 6px ${style.accent}66` }}
          />
          <span
            className={`label-caps ${style.text}`}
            style={{ textShadow: `0 0 5px ${style.accent}ff, 0 0 14px ${style.accent}dd, 0 0 30px ${style.accent}77` }}
          >
            {style.badge}
          </span>
        </div>
        {null}
      </div>

      {/* Card body — centered vertically */}
      <div className="flex-1 flex flex-col justify-center relative z-10">
        <div
          className={`relative transition-all duration-500 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
          }`}
        >
          {post.format === "books" && fc ? (
            <div className="card border-l-2 border-l-(--accent) px-6 py-7 flex flex-col gap-4">
              {/* Title row + cover */}
              <div className="flex gap-4 items-start">
                <div className="flex-1 min-w-0">
                  <h2 className="font-serif text-[1.75rem] font-medium tracking-tight text-ink leading-snug">
                    {fc.title as string}
                  </h2>
                  <p className="text-(--accent) text-sm font-medium mt-1">{fc.author as string}</p>
                </div>
                {fcStr(fc, "cover_url") && (
                  <div className="shrink-0 rounded-md overflow-hidden w-16 h-24 bg-surface-2 border border-edge">
                    <img
                      src={fcStr(fc, "cover_url")}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                    />
                  </div>
                )}
              </div>

              {/* Essence */}
              <p className="font-serif italic text-base text-ink-body leading-relaxed">{fc.essence as string}</p>

              {/* Teasers */}
              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}

              {/* Metadata bar */}
              <div className="flex items-center gap-3 pt-2 border-t border-edge">
                <DotScale value={fc.post_difficulty as 1 | 2 | 3} />
                {fcNum(fc, "post_reading_time_min") > 0 && (
                  <span className="text-ink-muted text-xs font-mono">{fcNum(fc, "post_reading_time_min")} min read</span>
                )}
                <span className="text-ink-muted text-xs font-mono">{fc.year as number}</span>
                <span className="text-ink-faint text-xs">·</span>
                <span className="text-ink-muted text-xs">{fc.genre as string}</span>
              </div>
            </div>
          ) : post.format === "people" && fc ? (
            <div className="card border-l-2 border-l-(--accent) px-6 py-7 flex flex-col gap-4">
              <div className="flex gap-4 items-start">
                {(fc.portrait as { image_url?: string } | undefined)?.image_url && (
                  <div className="shrink-0 w-20 h-20 rounded-full overflow-hidden bg-surface-2 border border-(--accent)/40">
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

              <p className="font-serif italic text-base text-ink-body leading-relaxed">{fc.essence as string}</p>

              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-edge">
                <DotScale value={fc.post_difficulty as 1 | 2 | 3} />
                {fcNum(fc, "post_reading_time_min") > 0 && (
                  <span className="text-ink-muted text-xs font-mono">{fcNum(fc, "post_reading_time_min")} min read</span>
                )}
              </div>
            </div>
          ) : post.format === "facts" && fc ? (
            <div className="card border-l-2 border-l-(--accent) px-6 py-7 flex flex-col gap-4">
              {fcStr(fc, "field") && (
                <p className="label-caps text-(--accent)">{fcStr(fc, "field")}</p>
              )}
              <h2 className="font-serif text-[1.75rem] font-medium tracking-tight text-ink leading-snug">
                {fc.headline as string}
              </h2>

              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-edge">
                <DotScale value={fc.post_difficulty as 1 | 2 | 3} />
                {fcNum(fc, "post_reading_time_min") > 0 && (
                  <span className="text-ink-muted text-xs font-mono">{fcNum(fc, "post_reading_time_min")} min read</span>
                )}
              </div>
            </div>
          ) : post.format === "concepts" && fc ? (
            <div className="card border-l-2 border-l-(--accent) px-6 py-7 flex flex-col gap-4">
              {fcStr(fc, "field") && (
                <p className="label-caps text-(--accent)">{fcStr(fc, "field")}</p>
              )}
              <h2 className="font-serif text-[1.75rem] font-medium tracking-tight text-ink leading-snug">
                {fcStr(fc, "concept_name")}
              </h2>
              {fcStr(fc, "one_line") && (
                <p className="font-serif italic text-base text-ink-body leading-relaxed">{fcStr(fc, "one_line")}</p>
              )}

              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-edge">
                <DotScale value={fc.post_difficulty as 1 | 2 | 3} />
                {fcNum(fc, "post_reading_time_min") > 0 && (
                  <span className="text-ink-muted text-xs font-mono">{fcNum(fc, "post_reading_time_min")} min read</span>
                )}
              </div>
            </div>
          ) : post.format === "questions" && fc ? (
            <div className="card border-l-2 border-l-(--accent) px-6 py-7 flex flex-col gap-4">
              {fcStr(fc, "field") && (
                <p className="label-caps text-(--accent)">{fcStr(fc, "field")}</p>
              )}
              <h2 className="font-serif text-[1.75rem] font-medium tracking-tight text-ink leading-snug">
                {fcStr(fc, "the_question")}
              </h2>
              {fcStr(fc, "framing_line") && (
                <p className="font-serif italic text-base text-ink-body leading-relaxed">{fcStr(fc, "framing_line")}</p>
              )}

              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-edge">
                <DotScale value={fc.post_difficulty as 1 | 2 | 3} />
                {fcNum(fc, "post_reading_time_min") > 0 && (
                  <span className="text-ink-muted text-xs font-mono">{fcNum(fc, "post_reading_time_min")} min read</span>
                )}
              </div>
            </div>
          ) : post.format === "stories" && fc ? (
            <div className="card border-l-2 border-l-(--accent) px-6 py-7 flex flex-col gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                {fcStr(fc, "era_label") && (
                  <span className="label-caps text-(--accent)">
                    {fcStr(fc, "era_label")}
                  </span>
                )}
                {fcStr(fc, "category") && (
                  <span className="label-caps text-ink-faint">{fcStr(fc, "category")}</span>
                )}
              </div>
              <h2 className="font-serif text-2xl font-medium tracking-tight text-ink leading-snug">
                {fcStr(fc, "headline")}
              </h2>

              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-edge">
                <DotScale value={fc.post_difficulty as 1 | 2 | 3} />
                {fcNum(fc, "post_reading_time_min") > 0 && (
                  <span className="text-ink-muted text-xs font-mono">{fcNum(fc, "post_reading_time_min")} min read</span>
                )}
                {fcStr(fc, "era") && (
                  <span className="text-ink-faint text-xs font-mono">{fcStr(fc, "era")}</span>
                )}
              </div>
            </div>
          ) : post.format === "academy" && fc ? (
            <div className="card border-l-2 border-l-(--accent) px-6 py-7 flex flex-col gap-4">
              {fcStr(fc, "field") && (
                <p className="label-caps text-(--accent)">{fcStr(fc, "field")}</p>
              )}
              <h2 className="font-serif text-[1.75rem] font-medium tracking-tight text-ink leading-snug">
                {fcStr(fc, "title") || post.title}
              </h2>
              {(fcStr(fc, "authors_compact") || fcStr(fc, "venue")) && (
                <p className="text-xs text-ink-muted font-mono">
                  {[fcStr(fc, "authors_compact"), fcStr(fc, "venue")].filter(Boolean).join(" · ")}
                </p>
              )}
              {fcStr(fc, "key_finding_one_line") && (
                <p className="font-serif italic text-base text-ink-body leading-relaxed">
                  {fcStr(fc, "key_finding_one_line")}
                </p>
              )}
              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}
              <div className="flex items-center gap-3 pt-2 border-t border-edge">
                <DotScale value={fc.post_difficulty as 1 | 2 | 3} />
                {fcNum(fc, "post_reading_time_min") > 0 && (
                  <span className="text-ink-muted text-xs font-mono">{fcNum(fc, "post_reading_time_min")} min read</span>
                )}
                {(fc.published_year as number) > 0 && (
                  <span className="text-ink-muted text-xs font-mono">{fc.published_year as number}</span>
                )}
              </div>
            </div>
          ) : (
            /* Fallback for unknown formats */
            <div className="card border-l-2 border-l-(--accent) px-6 py-7 flex flex-col gap-4">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-ink leading-snug">
                {post.title}
              </h2>
              {fcStr(fc, "essence") && (
                <p className="font-serif italic text-base text-ink-body leading-relaxed">{fcStr(fc, "essence")}</p>
              )}
            </div>
          )}

          {/* Author avatar — bottom-right corner of the card box */}
          {post.author_username && (
            <div className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-surface-2 border-2 border-edge-strong flex items-center justify-center shrink-0 overflow-hidden z-10">
              <span className="text-sm font-semibold text-ink-dim uppercase">
                {post.author_username[0]}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Interest tags */}
      <div className="absolute top-[calc(100%-88px)] left-5 right-10 flex flex-wrap gap-2 z-10">
        {post.interests.map((name) => (
          <span
            key={name}
            className="bg-surface-2/90 border border-edge text-ink-dim text-xs px-2.5 py-1 rounded-full"
          >
            {name}
          </span>
        ))}
      </div>

      {/* Action buttons — icon-only pill buttons per the Lamplight design spec. */}
      <div className="absolute right-2 z-10 flex flex-col items-center gap-1" style={{ bottom: "64px" }}>
        {/* Like */}
        <div className="flex flex-col items-center">
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleLike() }}
            aria-label={liked ? "Unlike" : "Like"}
            className={`btn-action${liked ? " btn-action-liked" : ""}`}
          >
            <svg
              viewBox="0 0 24 24"
              fill={liked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={liked ? 0 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`w-6 h-6 ${animatingLike ? "heart-pop" : ""}`}
              onAnimationEnd={() => setAnimatingLike(false)}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
          <span className={`text-xs font-sans leading-none transition-colors duration-150 ${liked ? "text-[#ff3a5c]" : "text-ink-dim"} ${likesCount === 0 && !liked ? "invisible" : ""}`}>{likesCount}</span>
        </div>

        {/* Comment */}
        <div className="flex flex-col items-center">
          <button
            onClick={(e) => { e.stopPropagation(); setShowComments(true) }}
            aria-label="Comments"
            className="btn-action"
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
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <span className={`text-xs text-ink-dim font-sans leading-none ${commentsCount === 0 ? "invisible" : ""}`}>{commentsCount}</span>
        </div>

        {/* Save */}
        <div className="flex flex-col items-center">
          <button
            onClick={handleSaveClick}
            aria-label={saved ? "Unsave" : "Save"}
            className={`btn-action${saved ? " btn-action-saved" : ""}`}
          >
            <svg
              viewBox="0 0 24 24"
              fill={saved ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={saved ? 0 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`w-6 h-6 ${animatingSave ? "heart-pop" : ""}`}
              onAnimationEnd={() => setAnimatingSave(false)}
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <span className={`text-xs font-sans leading-none transition-colors duration-150 ${saved ? "text-[#f5c542]" : "text-ink-dim"} ${saveCount === 0 && !saved ? "invisible" : ""}`}>{saveCount}</span>
        </div>

        {/* Share */}
        <div className="flex flex-col items-center">
          <button
            onClick={handleShare}
            aria-label="Share"
            className="btn-action"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      {showComments && (
        <CommentsBottomSheet
          postId={post.id}
          onClose={() => setShowComments(false)}
          onCountChange={setCommentsCount}
        />
      )}

      <Toast message="Link copied!" visible={toastVisible} />
    </div>
  )
}
