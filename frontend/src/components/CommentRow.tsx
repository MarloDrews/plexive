"use client"

// Stage chat-style comment row — the commenter's avatar next to a soft
// bubble. Shared by the comments sheet and the detail-page comments list.

import Avatar from "@/components/Avatar"
import VerifiedBadge from "@/components/VerifiedBadge"
import { relativeTime } from "@/lib/relativeTime"
import type { Comment } from "@/components/CommentsSection"

interface CommentRowProps {
  comment: Comment
  isOwn: boolean
  deleting: boolean
  onDelete: (id: number) => void
}

export default function CommentRow({ comment, isOwn, deleting, onDelete }: CommentRowProps) {
  return (
    <div className="flex items-start gap-2.5 mb-3">
      {/* Commenter avatar — real picture, initial-letter fallback */}
      <Avatar
        username={comment.username}
        avatarUrl={comment.avatar_url}
        size={28}
        className="mt-0.5"
      />

      {/* Bubble */}
      <div className="flex-1 min-w-0 rounded-2xl bg-surface-2 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-ink">{comment.username}</span>
          {comment.is_verified > 0 && <VerifiedBadge size={13} level={comment.is_verified} />}
          <span className="text-xs text-ink-muted">{relativeTime(comment.created_at)}</span>
          {isOwn && (
            <button
              onClick={() => onDelete(comment.id)}
              disabled={deleting}
              className="ml-auto text-xs text-ink-muted hover:text-bad transition-colors duration-150 cursor-pointer disabled:opacity-45 disabled:cursor-default"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          )}
        </div>
        <p className="text-sm text-ink-body mt-1 leading-relaxed">{comment.body}</p>
      </div>
    </div>
  )
}
