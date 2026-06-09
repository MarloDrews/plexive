"use client"

import { useRouter } from "next/navigation"
import { FORMAT_STYLES, type FormatId } from "@/lib/formats"

// Compact list card used wherever posts appear as rows (profile tabs etc.):
// format dot + badge + two-line title on a surface card.

interface Props {
  post: { id: number; format: string; title: string }
}

export default function PostRow({ post }: Props) {
  const router = useRouter()
  const style = FORMAT_STYLES[post.format as FormatId]
  return (
    <button
      onClick={() => router.push(`/post/${post.id}`)}
      className="w-full text-left bg-surface-1 rounded-card px-4 py-3 flex items-start gap-3"
    >
      <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${style?.dot ?? "bg-zinc-500"}`} />
      <div className="flex-1 min-w-0">
        {style && <span className={`text-xs font-medium ${style.text}`}>{style.badge}</span>}
        <p className="text-white font-semibold text-sm mt-0.5 line-clamp-2">{post.title}</p>
      </div>
    </button>
  )
}
