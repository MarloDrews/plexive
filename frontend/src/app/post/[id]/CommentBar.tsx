"use client"

import { useState } from "react"
import Link from "next/link"
import { useAuth } from "@/lib/auth"
import { ArrowUpIcon, HeartIcon } from "@/components/icons"

interface Props {
  posting: boolean
  postComment: (body: string) => Promise<unknown>
  // Called after a comment was accepted (the page scrolls the list into view).
  onPosted: () => void
  // The like circle renders only once the post exists.
  showLike: boolean
  liked: boolean
  onToggleLike: () => void
}

// The floating pill comment bar, owning the draft state. The draft used to
// live on the page component, so every keystroke re-rendered the entire
// detail tree (all sections including their KaTeX); now it re-renders only
// this bar.
export default function CommentBar({
  posting,
  postComment,
  onPosted,
  showLike,
  liked,
  onToggleLike,
}: Props) {
  const { user } = useAuth()
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setError("")
    // Keep the draft until the server confirms: a rate-limited (30/5min) or
    // failed comment must not silently vanish while the input looks empty.
    const created = await postComment(body)
    if (created) {
      setDraft("")
      onPosted()
    } else {
      setError("Could not post your comment. Please try again.")
    }
  }

  return (
    // Detached from every edge, sits above the bottom nav (page z-40 > nav
    // z-30); safe-area aware. The wrapper is the positioned element so an error
    // line can sit just above the pill (the pill stays pinned at the bottom).
    <div
      className="absolute left-3 right-3 z-10"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
    >
      {error && <p role="alert" className="mb-1.5 mx-3 text-bad text-xs">{error}</p>}
      <div className="rounded-full backdrop-blur-xl bg-white/[0.06] px-2 py-1.5 flex items-center gap-1.5">
      <div className="flex-1 min-w-0">
        {user ? (
          <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
            <input
              aria-label="Add a comment"
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
          <p className="text-sm text-ink-muted px-3 py-2 whitespace-nowrap overflow-hidden text-ellipsis">
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

      {/* Like circle — the bar carries only comment + like */}
      {showLike && (
        <button
          onClick={onToggleLike}
          aria-label={liked ? "Unlike" : "Like"}
          className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-95 ${
            liked ? "bg-like/10 text-like" : "bg-white/[0.06] text-ink-dim"
          }`}
        >
          <HeartIcon filled={liked} className="w-5 h-5" />
        </button>
      )}
      </div>
    </div>
  )
}
