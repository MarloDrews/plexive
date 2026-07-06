"use client"

// Stage comments sheet — a floating card detached from every edge, rounded
// on all corners. Keeps the drag gestures (swipe up expands, swipe down
// collapses or closes, live translateY feedback); the spring-in keyframes
// live in globals.css with a reduced-motion guard.

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useAuth } from "../lib/auth"
import { useComments } from "../lib/useComments"
import CommentRow from "./CommentRow"
import { ArrowUpIcon } from "./icons"

interface Props {
  postId: number
  onClose: () => void
  onCountChange?: (count: number) => void
}

export default function CommentsBottomSheet({ postId, onClose, onCountChange }: Props) {
  const { user } = useAuth()
  const { comments, error, posting, deletingId, postComment, deleteComment } = useComments(postId, onCountChange)
  const [draft, setDraft] = useState("")
  const [expanded, setExpanded] = useState(false)
  // Positive value = sheet dragged downward (visual feedback only)
  const [dragDelta, setDragDelta] = useState(0)

  const dragRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (await postComment(draft)) setDraft("")
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-surface-0/70" />

      {/* Floating card sheet — detached margins, rounded on all corners */}
      <div
        className="stage-sheet-in absolute inset-x-3 bottom-3 max-w-[406px] mx-auto rounded-3xl bg-surface-1/95 backdrop-blur-xl flex flex-col overflow-hidden"
        style={{
          maxHeight: expanded ? "75vh" : "50vh",
          transform: dragDelta > 0 ? `translateY(${dragDelta}px)` : undefined,
          transition: dragDelta > 0 ? "none" : "max-height 0.3s ease, transform 0.25s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle zone */}
        <div ref={dragRef} className="flex-none pt-3 pb-2 relative touch-none select-none">
          {/* Pill */}
          <div className="w-10 h-1 bg-edge-strong rounded-full mx-auto mb-2" />

          {/* Comment count (blank until the list loads so it never asserts 0) */}
          <p className="text-sm text-ink-dim text-center">
            {comments === null
              ? " "
              : comments.length === 1
                ? "1 comment"
                : `${comments.length} comments`}
          </p>

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close comments"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-ink-muted hover:text-ink hover:bg-white/[0.06] transition-colors duration-150 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Comment list — chat-style rows */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] px-4 py-3">
          {comments === null && !error ? (
            // Loading: pulsing rows where the comments will appear.
            <div className="flex flex-col gap-2 py-2">
              <div className="stage-pulse h-10 w-3/4 rounded-2xl bg-white/[0.04]" />
              <div className="stage-pulse h-10 w-2/3 rounded-2xl bg-white/[0.04]" />
              <div className="stage-pulse h-10 w-4/5 rounded-2xl bg-white/[0.04]" />
            </div>
          ) : error ? (
            <p className="text-sm text-ink-faint text-center py-6">Could not load comments.</p>
          ) : comments!.length === 0 ? (
            <p className="text-sm text-ink-faint text-center py-6">No comments yet</p>
          ) : (
            comments!.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                isOwn={user?.username === comment.username}
                deleting={deletingId === comment.id}
                onDelete={deleteComment}
              />
            ))
          )}
        </div>

        {/* Input bar — pill field + circular send, safe-area padded */}
        <div
          className="flex-none px-4 pt-1"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          {user ? (
            <form onSubmit={handleSubmit} className="flex gap-2 items-center">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment..."
                maxLength={2000}
                className="flex-1 min-w-0 h-11 rounded-full bg-white/[0.06] px-4 text-sm text-ink placeholder:text-ink-muted"
              />
              <button
                type="submit"
                disabled={!draft.trim() || posting}
                aria-label="Post comment"
                className={`w-11 h-11 shrink-0 rounded-full bg-white/[0.10] flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-95 disabled:opacity-45 disabled:cursor-default ${
                  draft.trim() && !posting ? "text-ink" : "text-ink-muted"
                }`}
              >
                <ArrowUpIcon className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink-muted text-center py-2">
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
