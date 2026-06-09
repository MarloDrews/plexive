"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { type Post } from "@/app/components/PostCard"
import { fcStr } from "@/types/post"
import { FORMAT_IDS, FORMAT_STYLES, type FormatId } from "@/lib/formats"
import { apiFetch } from "@/app/lib/api"
import BottomNav from "@/app/components/BottomNav"
import VerifiedBadge from "@/components/VerifiedBadge"
import Spinner from "@/components/Spinner"

const FORMAT_CHIPS: { label: string; value: FormatId | "" }[] = [
  { label: "All", value: "" },
  ...FORMAT_IDS.map((id) => ({ label: FORMAT_STYLES[id].label, value: id })),
]

type FormatValue = FormatId | ""

function Snippet({ post }: { post: Post }) {
  const text = fcStr(post.feed_card, "essence") || fcStr(post.feed_card, "headline")
  const snippet = text.length > 120 ? text.slice(0, 120) + "…" : text
  return <p className="text-zinc-400 text-xs mt-1 line-clamp-2">{snippet}</p>
}

function FormatBadge({ format }: { format: string }) {
  const style = FORMAT_STYLES[format as FormatId]
  if (!style) return null
  return (
    <span className={`text-xs font-medium ${style.text}`}>
      {style.badge}
    </span>
  )
}

export default function SearchPage() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [formatFilter, setFormatFilter] = useState<FormatValue>("")
  const [results, setResults] = useState<Post[] | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmed })
        if (formatFilter) params.set("format", formatFilter)
        const res = await apiFetch(`/api/search?${params}`)
        const data: Post[] = await res.json()
        setResults(data)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, formatFilter])

  return (
    <div className="h-[100dvh] bg-zinc-950 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative">

        {/* Top bar: back + search input */}
        <div className="absolute top-0 left-0 right-0 z-20 bg-zinc-950 px-3 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="shrink-0 w-9 h-9 flex items-center justify-center text-zinc-400"
              aria-label="Go back"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <div className="relative flex-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search posts, books, questions…"
                className="w-full bg-zinc-900 rounded-xl text-white placeholder:text-zinc-500 text-sm pl-9 pr-9 py-2.5 focus:outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
                  aria-label="Clear search"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Format chips */}
          <div className="flex gap-2 mt-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] pb-1">
            {FORMAT_CHIPS.map((chip) => {
              const isActive = formatFilter === chip.value
              const style = chip.value ? FORMAT_STYLES[chip.value] : null
              return (
                <button
                  key={chip.value}
                  onClick={() => setFormatFilter(chip.value)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? style
                        ? `bg-zinc-800 ${style.text}`
                        : "bg-zinc-700 text-white"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Results area */}
        <div className="absolute inset-0 top-[108px] overflow-y-auto pb-14 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] px-3">
          {loading ? (
            <div className="flex justify-center pt-16">
              <Spinner />
            </div>
          ) : !query.trim() ? (
            <div className="flex flex-col items-center justify-center pt-20 text-center px-6">
              <p className="text-zinc-500 text-sm">Search posts, books, questions…</p>
            </div>
          ) : results !== null && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-20 text-center px-6 gap-2">
              <p className="text-white font-semibold text-sm">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-zinc-500 text-xs">Try a different word or format</p>
            </div>
          ) : results !== null ? (
            <div className="flex flex-col gap-2 pt-2">
              {results.map((post) => (
                <button
                  key={post.id}
                  onClick={() => router.push(`/post/${post.id}`)}
                  className="w-full text-left bg-surface-1 rounded-card px-4 py-3"
                >
                  <FormatBadge format={post.format} />
                  <p className="text-white font-semibold text-sm mt-0.5 line-clamp-2">{post.title}</p>
                  <p className="flex items-center gap-1 text-zinc-600 text-xs mt-0.5">
                    {post.is_user_content && post.author_username ? (
                      <Link href={`/profile/${post.author_username}`} className="hover:text-zinc-400 transition-colors" onClick={(e) => e.stopPropagation()}>
                        @{post.author_username}
                      </Link>
                    ) : "Deepscroll"}
                    {post.is_user_content && post.author_is_verified && <VerifiedBadge size={14} />}
                  </p>
                  <Snippet post={post} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <BottomNav activeTab="search" />
      </div>
    </div>
  )
}
