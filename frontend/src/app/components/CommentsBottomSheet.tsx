"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useAuth } from "../lib/auth"
import { apiFetch } from "../lib/api"
import { relativeTime } from "../lib/relativeTime"
import { type Comment } from "./CommentsSection"
import VerifiedBadge from "@/components/VerifiedBadge"

interface Props {
  postId: number
  onClose: () => void
  onCountChange?: (count: number) => void
}

export default function CommentsBottomSheet({ postId, onClose, onCountChange }: Props) {
  const { user } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [draft, setDraft] = useState("")
  const [posting, setPosting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // Positive value = sheet dragged downward (visual feedback only)
  const [dragDelta, setDragDelta] = useState(0)

  const dragRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const loadedRef = useRef(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

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

  // Drag handle: swipe up → expand to 75 vh, swipe down → collapse or close
  useEffect(() => {
    const el = dragRef.current
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      dragStartY.current = e.touches[0].clientY
    }

    function onTouchMove(e: TouchEvent) {
      const dy = e.touches[0].clientY - dragStartY.current
      // Only provide visual feedback for downward drag
      if (dy > 0) setDragDelta(dy)
    }

    function onTouchEnd(e: TouchEvent) {
      const dy = e.changedTouches[0].clientY - dragStartY.current
      setDragDelta(0)

      if (dy < -60) {
        setExpanded(true)
      } else if (dy > 80) {
        if (expanded) setExpanded(false)
        else onClose()
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: true })
    el.addEventListener("touchend", onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
    }
  }, [expanded, onClose])

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

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-surface-0/70" />

      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-surface-1 border-t border-edge rounded-t-sheet flex flex-col"
        style={{
          maxHeight: expanded ? "75vh" : "50vh",
          transform: dragDelta > 0 ? `translateY(${dragDelta}px)` : undefined,
          transition: dragDelta > 0 ? "none" : "max-height 0.3s ease, transform 0.25s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle zone */}
        <div ref={dragRef} className="flex-none pt-3 pb-3 border-b border-edge relative touch-none select-none">
          {/* Pill */}
          <div className="w-10 h-1 bg-edge-strong rounded-full mx-auto mb-3" />

          {/* Comment count */}
          <p className="text-sm text-ink-dim text-center">
            {comments.length === 1 ? "1 comment" : `${comments.length} comments`}
          </p>

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close comments"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] px-4 py-2">
          {comments.length === 0 ? (
            <p className="text-sm text-ink-faint text-center py-6">No comments yet</p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="mb-4 pb-4 border-b border-edge last:border-b-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-ink">{comment.username}</span>
                  {comment.is_verified > 0 && <VerifiedBadge size={13} level={comment.is_verified} />}
                  <span className="text-xs text-ink-muted">{relativeTime(comment.created_at)}</span>
                  {user?.username === comment.username && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      disabled={deletingId === comment.id}
                      className="btn btn-destructive ml-auto px-2.5 py-1 text-xs"
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

        {/* Sticky input bar */}
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
                className={`btn-icon shrink-0${draft.trim() && !posting ? " btn-icon-active" : ""}`}
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
    </div>,
    document.body
  )
}
