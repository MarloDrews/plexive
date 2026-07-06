"use client"

import CommentRow from "@/components/CommentRow"

export interface Comment {
  id: number
  post_id: number
  username: string
  is_verified: number
  avatar_url: string | null
  body: string
  created_at: string
}

interface Props {
  comments: Comment[]
  currentUsername?: string
  onDelete: (id: number) => void
  deletingId: number | null
}

// Detail-page comments list — chat-bubble rows matching the comments sheet.
export default function CommentsSection({ comments, currentUsername, onDelete, deletingId }: Props) {
  return (
    <section className="pt-8">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="font-serif text-lg text-ink">Comments</h2>
        <span className="text-xs font-mono text-ink-muted">{comments.length}</span>
      </div>

      {comments.length === 0 ? (
        <p className="text-sm text-ink-faint">No comments yet</p>
      ) : (
        comments.map((comment) => (
          <CommentRow
            key={comment.id}
            comment={comment}
            isOwn={currentUsername === comment.username}
            deleting={deletingId === comment.id}
            onDelete={onDelete}
          />
        ))
      )}
    </section>
  )
}
