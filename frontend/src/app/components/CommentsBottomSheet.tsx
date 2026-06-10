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
      <div className="absolute inset-0 bg-zinc-950/60" />

      {/* Sheet — stopPropagation so clicks inside don't close via backdrop handler */}
      <div
        className="absolute bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-zinc-900 rounded-t-2xl flex flex-col"
        style={{ maxHeight: "75vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle zone */}
        <div ref={dragRef} className="flex-none pt-3 pb-3 border-b border-zinc-800">
          <div className="w-10 h-1 bg-zinc-600 rounded-full mx-auto mb-3" />
          <p className="text-sm text-zinc-400 text-center">
            {comments.length === 1 ? "1 comment" : `${comments.length} comments`}
          </p>
        </div>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] px-4 py-2">
          {comments.length === 0 ? (
            <p className="text-sm text-zinc-600 text-center py-6">No comments yet</p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="mb-4 pb-4 border-b border-zinc-800/50 last:border-b-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-white">{comment.username}</span>
                  <span className="text-xs text-zinc-500">{relativeTime(comment.created_at)}</span>
                  {user?.username === comment.username && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      disabled={deletingId === comment.id}
                      className="ml-auto text-xs text-zinc-600 hover:text-red-400 disabled:opacity-40 transition-colors"
                    >
                      {deletingId === comment.id ? "Deleting..." : "Delete"}
                    </button>
                  )}
                </div>
                <p className="text-sm text-zinc-300 mt-1 leading-relaxed">{comment.body}</p>
              </div>
            ))
          )}
        </div>

        {/* Sticky input bar */}
        <div className="flex-none border-t border-zinc-800 bg-zinc-900 px-4 py-2">
          {user ? (
            <form onSubmit={handleSubmit} className="flex gap-2 items-center">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment..."
                maxLength={2000}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              />
              <button
                type="submit"
                disabled={!draft.trim() || posting}
                className="text-sm text-white font-medium disabled:text-zinc-600 transition-colors"
              >
                Post
              </button>
            </form>
          ) : (
            <p className="text-sm text-zinc-500 text-center py-1">
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
      </div>
    </div>
  )
}
