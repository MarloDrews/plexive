"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useAuth } from "../lib/auth"
import { apiFetch } from "../lib/api"
import { relativeTime } from "../lib/relativeTime"
import { type Comment } from "./CommentsSection"

interface Props {
  postId: number
  onClose: () => void
  // Lets the parent card keep its comment counter in sync.
  onCountChange?: (count: number) => void
}

export default function CommentsBottomSheet({ postId, onClose, onCountChange }: Props) {
  const { user } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [draft, setDraft] = useState("")
  const [posting, setPosting] = useState(false)

  const dragRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Avoid reporting the pre-fetch empty list as a count of 0.
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

  // Drag-to-close on the handle zone only (avoids conflict with comment list scroll)
  useEffect(() => {
    const el = dragRef.current
    if (!el) return

    let startX = 0
    let startY = 0

    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }

    function onTouchEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY
      if (dy > 80 && dy > Math.abs(dx)) onClose()
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchend", onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchend", onTouchEnd)
    }
  }, [onClose])

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      const r = await apiFetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      })
      if (!r.ok) return
      const created: Comment = await r.json()
      setComments((prev) => [created, ...prev])
      setDraft("")
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-surface-0/70" />

      {/* Sheet — stopPropagation so clicks inside don't close via backdrop handler */}
      <div
        className="absolute bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-surface-1 border-t border-edge rounded-t-sheet flex flex-col"
        style={{ maxHeight: "75vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle zone */}
        <div ref={dragRef} className="flex-none pt-3 pb-3 border-b border-edge">
          <div className="w-10 h-1 bg-edge-strong rounded-full mx-auto mb-3" />
          <p className="text-sm text-ink-dim text-center">
            {comments.length === 1 ? "1 comment" : `${comments.length} comments`}
          </p>
        </div>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] px-4 py-2">
          {comments.length === 0 ? (
            <p className="text-sm text-ink-faint text-center py-6">No comments yet</p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="mb-4 pb-4 border-b border-edge last:border-b-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-ink">{comment.username}</span>
                  <span className="text-xs text-ink-muted">{relativeTime(comment.created_at)}</span>
                  {user?.username === comment.username && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      disabled={deletingId === comment.id}
                      className="ml-auto text-xs text-ink-faint hover:text-bad disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      {deletingId === comment.id ? "Deleting..." : "Delete"}
                    </button>
                  )}
                </div>
                <p className="text-sm text-ink-body mt-1 leading-relaxed">{comment.body}</p>
              </div>
            ))
          )}
        </div>

        {/* Sticky input bar. Safe-area padding keeps the send button above
            the OS home-indicator bar on real phones (same as BottomNav). */}
        <div
          className="flex-none border-t border-edge bg-surface-1 px-4 py-2"
          style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
        >
          {user ? (
            <form onSubmit={handleSubmit} className="flex gap-2 items-center">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment..."
                maxLength={2000}
                className="field rounded-full text-sm py-2"
              />
              <button
                type="submit"
                disabled={!draft.trim() || posting}
                aria-label="Post comment"
                className="btn btn-primary shrink-0 w-9 h-9 rounded-full p-0"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink-muted text-center py-1">
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
      </div>
    </div>
  )
}
