import { useEffect, useRef, useState } from "react"
import { apiFetch } from "./api"
import type { Comment } from "../components/CommentsSection"

// Comment list state shared by the comments sheet and the detail page list.
// Draft text and gestures stay in each component; this hook owns fetching,
// posting, and deleting.
export function useComments(postId: number, onCountChange?: (count: number) => void) {
  const [comments, setComments] = useState<Comment[]>([])
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [posting, setPosting] = useState(false)
  // Guard so onCountChange never fires with the empty pre-load list.
  const loadedRef = useRef(false)

  useEffect(() => {
    apiFetch(`/api/posts/${postId}/comments`)
      .then((r) => r.json())
      .then((data: Comment[]) => {
        loadedRef.current = true
        setComments(data)
      })
      .catch(() => {})
  }, [postId])

  useEffect(() => {
    if (loadedRef.current) onCountChange?.(comments.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments.length])

  async function deleteComment(commentId: number) {
    if (deletingId !== null) return
    setDeletingId(commentId)
    try {
      const r = await apiFetch(`/api/comments/${commentId}`, { method: "DELETE" })
      if (r.ok) setComments((prev) => prev.filter((c) => c.id !== commentId))
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
      setComments((prev) => [created, ...prev])
      return true
    } finally {
      setPosting(false)
    }
  }

  return { comments, posting, deletingId, postComment, deleteComment }
}
