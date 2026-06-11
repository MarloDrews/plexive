"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/app/lib/auth"
import { apiFetch } from "@/app/lib/api"
import { FORMAT_STYLES, type FormatId } from "@/lib/formats"
import BottomNav from "@/app/components/BottomNav"
import Spinner from "@/components/Spinner"
import { relativeTime } from "@/app/lib/relativeTime"
import { fcStr, type Post } from "@/types/post"

export default function MyPostsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [fetchError, setFetchError] = useState("")

  useEffect(() => {
    if (!loading && !user) { router.replace("/login"); return }
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    apiFetch("/api/posts/mine")
      .then((r) => r.json())
      .then((data: Post[]) => setPosts(data))
      .catch(() => setFetchError("Failed to load posts."))
  }, [user])

  if (loading || !user) return null

  return (
    <div className="h-[100dvh] bg-surface-0 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative">
        <div className="h-full overflow-y-auto pb-20 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">

          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <button
              onClick={() => router.back()}
              className="btn-icon"
              aria-label="Go back"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <h1 className="font-serif text-ink font-medium text-xl">My Posts</h1>
          </div>

          {fetchError && (
            <p className="text-bad text-sm px-4">{fetchError}</p>
          )}

          {/* Loading */}
          {posts === null && !fetchError && (
            <div className="flex justify-center pt-16">
              <Spinner />
            </div>
          )}

          {/* Empty state */}
          {posts !== null && posts.length === 0 && (
            <div className="flex flex-col items-center pt-24 px-8 gap-4 text-center">
              <p className="text-ink-dim text-sm">You haven&apos;t created any posts yet.</p>
              <button
                onClick={() => router.push("/create")}
                className="btn btn-primary px-6 py-2.5"
              >
                Create your first post
              </button>
            </div>
          )}

          {/* Post list */}
          {posts !== null && posts.length > 0 && (
            <div className="flex flex-col gap-2 px-4 pt-2">
              {posts.map((post) => {
                const style = FORMAT_STYLES[post.format as FormatId]
                return (
                  <button
                    key={post.id}
                    onClick={() => router.push(`/post/${post.id}`)}
                    className="w-full text-left card px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-surface-2 transition-colors duration-150"
                  >
                    {/* Cover thumbnail */}
                    <div className="shrink-0 w-10 h-14 rounded-md overflow-hidden bg-surface-2 border border-edge">
                      {fcStr(post.feed_card, "cover_url") ? (
                        <img
                          src={fcStr(post.feed_card, "cover_url")}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                        />
                      ) : (
                        <span className={`w-full h-full flex items-center justify-center text-lg ${style?.dot ?? "bg-fmt-neutral"}`} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {style && (
                          <span className={`label-caps ${style.text}`}>{style.badge}</span>
                        )}
                        {post.status === "pending" && (
                          <span className="bg-lamp/15 text-lamp rounded-full px-2 py-0.5 text-xs">
                            Pending review
                          </span>
                        )}
                        {post.status === "published" && (
                          <span className="bg-good/15 text-good rounded-full px-2 py-0.5 text-xs">
                            Published
                          </span>
                        )}
                      </div>
                      <p className="text-ink font-serif font-medium text-[15px] mt-0.5 line-clamp-2">{post.title}</p>
                      {fcStr(post.feed_card, "author") && (
                        <p className="text-ink-muted text-xs mt-0.5 truncate">{fcStr(post.feed_card, "author")}</p>
                      )}
                      {post.created_at && (
                        <p className="text-ink-faint text-xs font-mono mt-1">{relativeTime(post.created_at)}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <BottomNav activeTab="create" />
      </div>
    </div>
  )
}
