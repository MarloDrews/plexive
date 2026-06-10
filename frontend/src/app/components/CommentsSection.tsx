"use client"

import { relativeTime } from "@/app/lib/relativeTime"

export interface Comment {
  id: number
  post_id: number
  username: string
  body: string
  created_at: string
}

interface Props {
  comments: Comment[]
  currentUsername?: string
  onDelete: (id: number) => void
  deletingId: number | null
}

export default function CommentsSection({ comments, currentUsername, onDelete, deletingId }: Props) {
  return (
    <section className="border-t border-zinc-800 mt-8 pt-6">
      <p className="text-sm text-zinc-400 mb-4">
        {comments.length === 1 ? "1 comment" : `${comments.length} comments`}
      </p>

      <div>
        {comments.map((comment) => (
          <div key={comment.id} className="mb-4 pb-4 border-b border-zinc-800/50 last:border-b-0">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-white">{comment.username}</span>
              <span className="text-xs text-zinc-500">{relativeTime(comment.created_at)}</span>
              {currentUsername === comment.username && (
                <button
                  onClick={() => onDelete(comment.id)}
                  disabled={deletingId === comment.id}
                  className="ml-auto text-xs text-zinc-600 hover:text-red-400 disabled:opacity-40 transition-colors"
                >
                  {deletingId === comment.id ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
            <p className="text-sm text-zinc-300 mt-1 leading-relaxed">{comment.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
