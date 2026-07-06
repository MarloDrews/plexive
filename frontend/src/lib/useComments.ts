import { useEffect, useRef, useState } from "react"
import { apiFetch } from "./api"
import type { Comment } from "../components/CommentsSection"

// Comment list state shared by the comments sheet and the detail page list.
// Draft text and gestures stay in each component; this hook owns fetching,
// posting, and deleting.
//
// comments is null while the first fetch is in flight and stays null on a
// failed fetch (error is set), so consumers can render a loading state instead
// of asserting "No comments yet" over a post the card just showed a nonzero
// count for.
export function useComments(postId: number, onCountChange?: (count: number) => void) {
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [error, setError] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [posting, setPosting] = useState(false)
  // Guard so onCountChange never fires with the pre-load (null) list.
  const loadedRef = useRef(false)

  useEffect(() => {
    let stale = false
    loadedRef.current = false
    setComments(null)
    setError(false)
    apiFetch(`/api/posts/${postId}/comments`)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`)
        return r.json()
      })
      .then((data: Comment[]) => {
        if (stale) return
        loadedRef.current = true
        setComments(data)
      })
      .catch(() => {
        if (!stale) setError(true)
      })
    return () => {
      stale = true
    }
  }, [postId])

  useEffect(() => {
    if (loadedRef.current && comments !== null) onCountChange?.(comments.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments])

  async function deleteComment(commentId: number) {
    if (deletingId !== null) return
    setDeletingId(commentId)
    try {
      const r = await apiFetch(`/api/comments/${commentId}`, { method: "DELETE" })
      if (r.ok) setComments((prev) => (prev ? prev.filter((c) => c.id !== commentId) : prev))
    } finally {
      setDeletingId(null)
    }
  }

  // Returns true when the comment was created so callers can clear their draft.
  async function postComment(body: string): Promise<boolean> {
    const trimmed = body.trim()
    if (!trimmed || posting) return false
    setPosting(true)
    try {
      const r = await apiFetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: trimmed }),
      })
      if (!r.ok) return false
      const created: Comment = await r.json()
      setComments((prev) => (prev ? [created, ...prev] : [created]))
      return true
    } finally {
      setPosting(false)
    }
  }

  return { comments, error, posting, deletingId, postComment, deleteComment }
}
