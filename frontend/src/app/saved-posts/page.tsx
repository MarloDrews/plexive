"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import PostCard, { type Post } from "@/components/PostCard"
import { getSavedPostIds } from "@/lib/savedPosts"
import { fetchPostsByIds } from "@/lib/fetchPosts"
import { useWindowedFeed } from "@/lib/useWindowedFeed"
import BottomNav from "@/components/BottomNav"
import ToastHost from "@/components/ToastHost"
import { BookmarkIcon } from "@/components/icons"

export default function SavedPostsPage() {
  const router = useRouter()
  const [posts, setPosts] = useState<Post[] | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Same windowing as the feed: a heavy saver no longer mounts one
  // full-screen card per saved post at once.
  const { start, end } = useWindowedFeed(scrollRef, posts?.length ?? 0)

  useEffect(() => {
    const ids = getSavedPostIds()
    if (ids.length === 0) {
      setPosts([])
      return
    }
    // One detail fetch per saved id, but bounded so a heavy saver does not fire
    // hundreds of concurrent requests at once (a backend batch endpoint is the
    // real fix). Missing/deleted ids come back null and are skipped.
    fetchPostsByIds<Post>(ids).then((results) => {
      setPosts(results.filter((p): p is Post => p !== null))
    })
  }, [])

  return (
    <div className="h-[100dvh] bg-surface-0 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative overflow-hidden">

        {/* Loading: pulsing slabs where the card slab would sit */}
        {posts === null && (
          <div className="h-full flex flex-col justify-center px-5 gap-4">
            <div className="stage-pulse card h-72 w-full" />
            <div className="stage-pulse card h-20 w-3/4" />
          </div>
        )}

        {/* Empty state */}
        {posts !== null && posts.length === 0 && (
          <div className="h-full flex items-center justify-center px-6 pb-24">
            <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-4">
              <BookmarkIcon strokeWidth={1.5} className="w-10 h-10 text-ink-faint" />
              <p className="text-ink-dim text-sm">
                No saved posts yet. Tap the bookmark icon on any post to save it.
              </p>
              <button
                onClick={() => router.back()}
                className="btn btn-ghost text-sm"
              >
                Go back
              </button>
            </div>
          </div>
        )}

        {/* Feed */}
        {posts !== null && posts.length > 0 && (
          <>
            {/* Floating back button overlaid on the snap feed */}
            <button
              onClick={() => router.back()}
              className="btn-icon absolute top-4 left-4 z-40"
              aria-label="Go back"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <div ref={scrollRef} className="h-[100dvh] overflow-y-auto snap-y snap-mandatory [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {start > 0 && <div aria-hidden="true" style={{ height: `${start * 100}dvh` }} />}
              {posts.slice(start, end).map((post) => (
                <div key={post.id} className="snap-center shrink-0 h-[100dvh] relative">
                  <PostCard post={post} activeTabId={`saved-${post.id}`} />
                </div>
              ))}
              {end < posts.length && (
                <div aria-hidden="true" style={{ height: `${(posts.length - end) * 100}dvh` }} />
              )}
            </div>
          </>
        )}

        <BottomNav activeTab="profile" />
        {/* The one toast element for every card's share feedback. */}
        <ToastHost />
      </div>
    </div>
  )
}
