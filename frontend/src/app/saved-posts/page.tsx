"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import PostCard, { type Post } from "@/app/components/PostCard"
import { getSavedPostIds } from "@/app/lib/savedPosts"
import { apiFetch } from "@/app/lib/api"
import BottomNav from "@/app/components/BottomNav"
import Spinner from "@/components/Spinner"

export default function SavedPostsPage() {
  const router = useRouter()
  const [posts, setPosts] = useState<Post[] | null>(null)

  useEffect(() => {
    const ids = getSavedPostIds()
    if (ids.length === 0) {
      setPosts([])
      return
    }
    Promise.allSettled(
      ids.map((id) =>
        apiFetch(`/api/posts/${id}`).then((r) => (r.ok ? (r.json() as Promise<Post>) : null))
      )
    ).then((results) => {
      const loaded = results
        .filter(
          (r): r is PromiseFulfilledResult<Post | null> => r.status === "fulfilled"
        )
        .map((r) => r.value)
        .filter((p): p is Post => p !== null)
      setPosts(loaded)
    })
  }, [])

  return (
    <div className="h-[100dvh] bg-zinc-950 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative overflow-hidden">

        {/* Loading */}
        {posts === null && (
          <div className="flex items-center justify-center h-full">
            <Spinner />
          </div>
        )}

        {/* Empty state */}
        {posts !== null && posts.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center px-8 gap-4 text-center pb-14">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-10 h-10 text-zinc-700"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-zinc-400 text-sm">
              No saved posts yet. Tap the bookmark icon on any post to save it.
            </p>
            <button
              onClick={() => router.back()}
              className="text-zinc-500 text-sm underline"
            >
              Go back
            </button>
          </div>
        )}

        {/* Feed */}
        {posts !== null && posts.length > 0 && (
          <>
            {/* Floating back button overlaid on the snap feed */}
            <button
              onClick={() => router.back()}
              className="absolute top-4 left-4 z-40 w-11 h-11 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
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

            <div className="h-[100dvh] overflow-y-auto snap-y snap-mandatory [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {posts.map((post) => (
                <div key={post.id} className="snap-center shrink-0 h-[100dvh] relative">
                  <PostCard post={post} activeTabId={`saved-${post.id}`} />
                </div>
              ))}
            </div>
          </>
        )}

        <BottomNav activeTab="profile" />
      </div>
    </div>
  )
}
