"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { apiFetch } from "@/lib/api"
import { queueEvent, hasPendingLike, cancelPendingLike } from "@/lib/eventQueue"
import {
  likePost,
  unlikePost,
  isPostLiked,
  getCachedLikeCount,
  setCachedLikeCount,
  isLikeSent,
  markLikeSent,
  unmarkLikeSent,
} from "@/lib/likedPosts"

export type LikeToggleResult = "liked" | "unliked" | null

// Shared like state and reconciliation for one post, used by the feed card and
// the detail page (previously two hand-maintained copies). Owns: the liked flag,
// the display count, the GET /likes reconciliation against the three localStorage
// keys, and the like/unlike toggle with its event queueing and pending-event
// cancellation. Animation, toast and view tracking stay at each call site.
//
// serverLikeCount seeds the count: pass the post's like_count when it is known
// (the feed card, at mount), or null when the post has not loaded yet (the detail
// page). Once it becomes known the hook re-seeds, unless the user already
// interacted. This preserves both call sites' original seeding exactly.
export function usePostLike(postId: number, serverLikeCount: number | null) {
  const [liked, setLiked] = useState(() => isPostLiked(postId))
  const [likesCount, setLikesCount] = useState(
    () => getCachedLikeCount(postId) ?? serverLikeCount ?? 0
  )
  // Once the user likes/unlikes here, the async reconcilers must not overwrite
  // the count with a pre-interaction value.
  const interactedRef = useRef(false)
  // reconcile() fetches at most once per post; reset when the post changes.
  const reconciledRef = useRef(false)
  useEffect(() => {
    reconciledRef.current = false
  }, [postId])

  // Re-seed from the server count once it becomes known (the detail page loads
  // the post after mount). No-op on the feed card, where it is known at mount.
  useEffect(() => {
    if (interactedRef.current || serverLikeCount === null) return
    setLikesCount(getCachedLikeCount(postId) ?? serverLikeCount)
  }, [postId, serverLikeCount])

  // Reconcile the display count against the server, adjusting for a like this
  // client queued but the server has not counted yet, or a local like the
  // server has not seen. Same formula both call sites carried. This used to run
  // in a mount effect, so a feed of N cards fired N requests immediately on
  // load; now the caller decides when (the feed card on first intersection, the
  // detail page once the post has loaded) and it fetches at most once per post.
  const reconcile = useCallback(() => {
    if (reconciledRef.current) return
    reconciledRef.current = true
    apiFetch(`/api/posts/${postId}/likes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // Apply only a real numeric count: an error body (or a missing field)
        // would make d.count undefined and render "NaN" next to the heart.
        if (interactedRef.current || !d || typeof d.count !== "number") return
        const l = isPostLiked(postId)
        const sent = isLikeSent(postId)
        const onServer = sent && !hasPendingLike(postId)
        const adjust = (l && !onServer ? 1 : 0) - (!l && sent ? 1 : 0)
        const display = Math.max(0, d.count + adjust)
        setLikesCount(display)
        setCachedLikeCount(postId, display)
      })
      .catch(() => {})
  }, [postId])

  // Re-read liked + cached count from storage. The feed card calls this when a
  // card scrolls back into view so it reflects a like made on the detail page.
  const syncFromStorage = useCallback(() => {
    setLiked(isPostLiked(postId))
    const cached = getCachedLikeCount(postId)
    if (cached !== null) setLikesCount(cached)
  }, [postId])

  // Like or unlike, whichever applies. Returns which way it went so the caller
  // can fire its like animation only on a fresh like.
  const toggleLike = useCallback((): LikeToggleResult => {
    interactedRef.current = true
    if (isPostLiked(postId)) {
      unlikePost(postId)
      setLiked(false)
      setLikesCount((prev) => {
        // Never show a negative count (a dropped-flush desync could take it to -1).
        const n = Math.max(0, prev - 1)
        setCachedLikeCount(postId, n)
        return n
      })
      if (hasPendingLike(postId)) {
        // The like never left the queue: just drop it before it flushes.
        cancelPendingLike(postId)
        unmarkLikeSent(postId)
      } else if (isLikeSent(postId)) {
        // The like already reached the server; queue an unlike so the server
        // decrements, and clear the marker so reconcile stops counting it.
        queueEvent({ post_id: postId, event_type: "unlike" })
        unmarkLikeSent(postId)
      }
      return "unliked"
    }
    likePost(postId)
    setLiked(true)
    setLikesCount((prev) => {
      const n = prev + 1
      setCachedLikeCount(postId, n)
      return n
    })
    if (!isLikeSent(postId)) {
      markLikeSent(postId)
      queueEvent({ post_id: postId, event_type: "like" })
    }
    return "liked"
  }, [postId])

  return { liked, likesCount, toggleLike, syncFromStorage, reconcile }
}
