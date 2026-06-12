"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import CommentsBottomSheet from "./CommentsBottomSheet"
import Toast from "./Toast"
import { queueEvent, hasPendingLike, cancelPendingLike } from "@/app/lib/eventQueue"
import { apiFetch } from "@/app/lib/api"
import { savePost, unsavePost, isPostSaved } from "@/app/lib/savedPosts"
import { likePost, unlikePost, isPostLiked, getCachedLikeCount, setCachedLikeCount, isLikeSent, markLikeSent, unmarkLikeSent } from "@/app/lib/likedPosts"
import { updatePostInFeedCaches } from "@/app/lib/swr"
import { fcNum, fcStr, type Post } from "@/types/post"
import { formatStyle } from "@/lib/formats"
import Avatar from "@/components/Avatar"
import VerifiedBadge from "@/components/VerifiedBadge"

export type { Post }

const MIN_DWELL_MS = 500

// Difficulty as three neutral dots; the per-format accent stays on the
// format marker and the teaser bullets only.
function DotScale({ value }: { value: 1 | 2 | 3 }) {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`inline-block w-1 h-1 rounded-full ${i <= value ? "bg-ink-dim" : "bg-white/15"}`}
        />
      ))}
    </span>
  )
}

// Teaser bullets — a plain list, deliberately not container-shaped so the
// teasers never read as tappable. The small accent markers are one of the
// few post-owned accent elements.
function Teasers({ items }: { items: string[] }) {
  return (
    <div className="mt-1 space-y-2">
      {items.map((teaser, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="w-1 h-1 rounded-full bg-(--accent)/70 mt-[0.45rem] shrink-0" />
          <span className="text-sm text-ink-dim leading-snug">{teaser}</span>
        </div>
      ))}
    </div>
  )
}

// Slab footer: creator byline on the left, neutral reading metadata on the
// right. Lives inside the slab so the card carries its own context.
function CardFooter({
  post,
  fc,
  extras = [],
}: {
  post: Post
  fc: Post["feed_card"]
  extras?: (string | number | null | undefined)[]
}) {
  const difficulty = fcNum(fc, "post_difficulty")
  const minutes = fcNum(fc, "post_reading_time_min")
  const metaText = [minutes > 0 ? `${minutes} min` : null, ...extras]
    .filter((x) => x !== null && x !== undefined && x !== "" && x !== 0)
    .join(" · ")
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
      // Invariant wrapper: the vertical snap feed and scroll restore depend
      // on these classes. One post fills the screen; nothing bleeds in.
      className="h-[100dvh] relative overflow-hidden shrink-0 snap-start [scroll-snap-stop:always] bg-surface-0"
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

      {/* Content floats in the dark: marker + slab, centered vertically. */}
      <div className="relative h-full flex flex-col justify-center px-5 pt-16 pb-28 z-10">
        <div
          className={`transition-all duration-500 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* Format marker floating above the slab — the only accent chrome. */}
          <div className="flex items-center gap-2 mb-3 pl-2">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-(--accent)" />
            <span className="text-xs font-mono lowercase tracking-widest text-ink-muted">
              {style.badge.toLowerCase()}
            </span>
          </div>

          {post.format === "books" && fc ? (
            <div className="card px-6 py-7 flex flex-col gap-4">
              {/* Title row + cover */}
              <div className="flex gap-4 items-start">
                <div className="flex-1 min-w-0">
                  <h2 className="font-serif text-[1.75rem] font-medium tracking-tight text-ink leading-snug">
                    {fc.title as string}
                  </h2>
                  <p className="text-ink-dim text-sm font-medium mt-1">{fc.author as string}</p>
                </div>
                {fcStr(fc, "cover_url") && (
                  <div className="shrink-0 rounded-xl overflow-hidden w-16 h-24 bg-white/[0.06]">
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

              <CardFooter post={post} fc={fc} extras={[fc.year as number, fc.genre as string]} />
            </div>
          ) : post.format === "people" && fc ? (
            <div className="card px-6 py-7 flex flex-col gap-4">
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
                    <p className="label-caps text-ink-muted mb-0.5">
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

              <CardFooter post={post} fc={fc} />
            </div>
          ) : post.format === "facts" && fc ? (
            <div className="card px-6 py-7 flex flex-col gap-4">
              {fcStr(fc, "field") && (
                <p className="label-caps text-ink-muted">{fcStr(fc, "field")}</p>
              )}
              <h2 className="font-serif text-[1.75rem] font-medium tracking-tight text-ink leading-snug">
                {fc.headline as string}
              </h2>

              {Array.isArray(fc.teasers) && (fc.teasers as string[]).length > 0 && (
                <Teasers items={fc.teasers as string[]} />
              )}

              <CardFooter post={post} fc={fc} />
            </div>
          ) : post.format === "concepts" && fc ? (
            <div className="card px-6 py-7 flex flex-col gap-4">
              {fcStr(fc, "field") && (
                <p className="label-caps text-ink-muted">{fcStr(fc, "field")}</p>
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

              <CardFooter post={post} fc={fc} />
            </div>
          ) : post.format === "questions" && fc ? (
            <div className="card px-6 py-7 flex flex-col gap-4">
              {fcStr(fc, "field") && (
                <p className="label-caps text-ink-muted">{fcStr(fc, "field")}</p>
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

              <CardFooter post={post} fc={fc} />
            </div>
          ) : post.format === "stories" && fc ? (
            <div className="card px-6 py-7 flex flex-col gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                {fcStr(fc, "era_label") && (
                  <span className="label-caps text-ink-muted">
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

              <CardFooter post={post} fc={fc} extras={[fcStr(fc, "era")]} />
            </div>
          ) : post.format === "academy" && fc ? (
            <div className="card px-6 py-7 flex flex-col gap-4">
              {fcStr(fc, "field") && (
                <p className="label-caps text-ink-muted">{fcStr(fc, "field")}</p>
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
              <CardFooter post={post} fc={fc} extras={[fc.published_year as number]} />
            </div>
          ) : (
            /* Fallback for unknown formats */
            <div className="card px-6 py-7 flex flex-col gap-4">
              <h2 className="font-serif text-3xl font-medium tracking-tight text-ink leading-snug">
                {post.title}
              </h2>
              {fcStr(fc, "essence") && (
                <p className="font-serif italic text-base text-ink-body leading-relaxed">{fcStr(fc, "essence")}</p>
              )}
              <CardFooter post={post} fc={fc} />
            </div>
          )}
        </div>
      </div>

      {/* Interest tags — floating pills bottom-left, clear of the actions. */}
      {post.interests.length > 0 && (
        <div className="absolute left-4 right-20 bottom-24 flex flex-wrap gap-2 z-10">
          {post.interests.slice(0, 2).map((name) => (
            <span
              key={name}
              className="rounded-full bg-white/[0.05] backdrop-blur-md text-ink-dim text-xs px-3 py-1.5"
            >
              {name}
            </span>
          ))}
        </div>
      )}

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
