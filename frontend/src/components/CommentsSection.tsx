"use client"

import CommentRow from "@/components/CommentRow"

export interface Comment {
  id: number
  post_id: number
  username: string
  is_verified: number
  avatar_url: string | null
  avatar_frame_id: number | null
  body: string
  created_at: string
}

interface Props {
  // null while the first fetch is in flight; error true on a failed fetch.
  comments: Comment[] | null
  error?: boolean
  currentUsername?: string
  onDelete: (id: number) => void
  deletingId: number | null
}

// Detail-page comments list — chat-bubble rows matching the comments sheet.
export default function CommentsSection({ comments, error, currentUsername, onDelete, deletingId }: Props) {
  return (
    <section className="pt-8">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="font-serif text-lg text-ink">Comments</h2>
        {comments !== null && <span className="text-xs font-mono text-ink-muted">{comments.length}</span>}
      </div>

      {comments === null && !error ? (
        // Loading: pulsing rows where the comments will appear.
        <div className="flex flex-col gap-2">
          <div className="stage-pulse h-10 w-3/4 rounded-2xl bg-white/[0.04]" />
          <div className="stage-pulse h-10 w-2/3 rounded-2xl bg-white/[0.04]" />
        </div>
      ) : error ? (
        <p className="text-sm text-ink-muted">Could not load comments.</p>
      ) : comments!.length === 0 ? (
        <p className="text-sm text-ink-muted">No comments yet</p>
      ) : (
        <ul>
          {comments!.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              isOwn={currentUsername === comment.username}
              deleting={deletingId === comment.id}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
