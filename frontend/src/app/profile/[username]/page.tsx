"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/app/lib/auth"
import { apiFetch } from "@/app/lib/api"
import { getSavedPostIds } from "@/app/lib/savedPosts"
import { getLikedPostIds } from "@/app/lib/likedPosts"
import BottomNav from "@/app/components/BottomNav"
import VerifiedBadge from "@/components/VerifiedBadge"
import PostRow from "@/components/PostRow"
import Spinner from "@/components/Spinner"

interface ProfileData {
  username: string
  is_verified: boolean
  is_private: boolean
  bio: string | null
  follower_count: number
  following_count: number
  post_count: number
  follow_status: string | null
}

interface Post {
  id: number
  format: string
  title: string
  status: string
  created_at: string
}

type Tab = "posts" | "saved" | "liked"

export default function PublicProfilePage() {
  const params = useParams()
  const username = params.username as string
  const router = useRouter()
  const { user } = useAuth()

  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [savedPosts, setSavedPosts] = useState<Post[] | null>(null)
  const [likedPosts, setLikedPosts] = useState<Post[] | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("posts")
  const [followLoading, setFollowLoading] = useState(false)
  const [error, setError] = useState("")

  const isOwnProfile = user?.username === username

  useEffect(() => {
    apiFetch(`/api/users/${username}/profile`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found")
        return r.json() as Promise<ProfileData>
      })
      .then(setProfile)
      .catch(() => setError("Profile not found."))
  }, [username])

  useEffect(() => {
    apiFetch(`/api/feed/user/${username}`)
      .then((r) => r.json())
      .then((data: Post[]) => setPosts(data))
      .catch(() => setPosts([]))
  }, [username])

  // Saved/liked tabs: only load for own profile from localStorage
  useEffect(() => {
    if (!isOwnProfile) return
    const ids = getSavedPostIds()
    if (ids.length === 0) { setSavedPosts([]); return }
    Promise.all(ids.map((id) => apiFetch(`/api/posts/${id}`).then((r) => (r.ok ? r.json() : null))))
      .then((results) => setSavedPosts(results.filter(Boolean) as Post[]))
      .catch(() => setSavedPosts([]))
  }, [isOwnProfile])

  useEffect(() => {
    if (!isOwnProfile) return
    const ids = getLikedPostIds()
    if (ids.length === 0) { setLikedPosts([]); return }
    Promise.all(ids.map((id) => apiFetch(`/api/posts/${id}`).then((r) => (r.ok ? r.json() : null))))
      .then((results) => setLikedPosts(results.filter(Boolean) as Post[]))
      .catch(() => setLikedPosts([]))
  }, [isOwnProfile])

  async function handleFollow() {
    if (!profile) return
    setFollowLoading(true)
    try {
      const followStatus = profile.follow_status
      if (followStatus === "accepted" || followStatus === "pending") {
        await apiFetch(`/api/users/${username}/follow`, { method: "DELETE" })
        setProfile((p) => p ? { ...p, follow_status: "none", follower_count: Math.max(0, p.follower_count - (followStatus === "accepted" ? 1 : 0)) } : p)
      } else {
        const r = await apiFetch(`/api/users/${username}/follow`, { method: "POST" })
        const data = await r.json()
        setProfile((p) => p ? { ...p, follow_status: data.status, follower_count: data.status === "accepted" ? p.follower_count + 1 : p.follower_count } : p)
      }
    } finally {
      setFollowLoading(false)
    }
  }

  const canSeePrivateContent = isOwnProfile || profile?.follow_status === "accepted" || !profile?.is_private

  if (error) {
    return (
      <div className="h-[100dvh] bg-zinc-950 flex justify-center">
        <div className="w-full max-w-[430px] flex items-center justify-center">
          <p className="text-zinc-400 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="h-[100dvh] bg-zinc-950 flex justify-center">
        <div className="w-full max-w-[430px] flex items-center justify-center">
          <Spinner />
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] bg-zinc-950 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative overflow-y-auto pb-20 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">

        {/* Header */}
        <div className="flex items-center px-4 pt-4 pb-2">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center text-zinc-400"
            aria-label="Go back"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="flex-1 text-center text-white font-semibold text-base">{username}</span>
          {isOwnProfile ? (
            <button
              onClick={() => router.push("/profile")}
              className="w-9 h-9 flex items-center justify-center text-zinc-400"
              aria-label="Settings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          ) : (
            <button className="w-9 h-9 flex items-center justify-center text-zinc-400" aria-label="More options">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <circle cx="5" cy="12" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="19" cy="12" r="1.5" />
              </svg>
            </button>
          )}
        </div>

        {/* Profile section */}
        <div className="px-4 pt-4 pb-2">
          {/* Avatar */}
          <div className="w-[72px] h-[72px] rounded-full bg-zinc-700 flex items-center justify-center mb-3">
            <span className="text-white text-2xl font-bold uppercase">
              {username.charAt(0)}
            </span>
          </div>

          {/* Username + verified */}
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-white text-xl font-bold">{username}</span>
            {profile.is_verified && <VerifiedBadge size={18} />}
          </div>

          {/* Private label */}
          {profile.is_private && (
            <p className="text-zinc-400 text-xs mb-1">Private account</p>
          )}

          {/* Bio */}
          {profile.bio && (
            <p className="text-zinc-300 text-sm mb-3">{profile.bio}</p>
          )}

          {/* Stats row */}
          <div className="flex gap-6 mb-4">
            <div className="text-center">
              <p className="text-white font-bold text-base">{profile.post_count}</p>
              <p className="text-zinc-400 text-xs">Posts</p>
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-base">{profile.follower_count}</p>
              <p className="text-zinc-400 text-xs">Followers</p>
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-base">{profile.following_count}</p>
              <p className="text-zinc-400 text-xs">Following</p>
            </div>
          </div>

          {/* Follow / Edit Profile button */}
          {isOwnProfile ? (
            <Link
              href="/profile"
              className="block w-full text-center border border-zinc-600 text-white rounded-xl py-2 text-sm font-semibold"
            >
              Edit Profile
            </Link>
          ) : user ? (
            <button
              onClick={handleFollow}
              disabled={followLoading}
              className={`w-full rounded-xl py-2 text-sm font-semibold transition-opacity ${followLoading ? "opacity-50" : ""} ${
                profile.follow_status === "accepted" || profile.follow_status === "pending"
                  ? "border border-zinc-600 text-zinc-400"
                  : "bg-white text-zinc-950"
              }`}
            >
              {profile.follow_status === "accepted" ? "Following" : profile.follow_status === "pending" ? "Requested" : "Follow"}
            </button>
          ) : (
            <Link
              href="/login"
              className="block w-full text-center bg-white text-zinc-950 rounded-xl py-2 text-sm font-semibold"
            >
              Follow
            </Link>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-zinc-800 mt-2">
          {(["posts", "saved", "liked"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "text-white border-b-2 border-zinc-400"
                  : "text-zinc-500"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-4 pt-3">
          {activeTab === "posts" && <PostsTab posts={posts} />}
          {activeTab === "saved" && (
            <PrivateTabContent canSee={canSeePrivateContent} isOwnProfile={isOwnProfile} posts={savedPosts} lockedMessage="Follow to see saved posts" privateMessage="Saved posts are private" />
          )}
          {activeTab === "liked" && (
            <PrivateTabContent canSee={canSeePrivateContent} isOwnProfile={isOwnProfile} posts={likedPosts} lockedMessage="Follow to see liked posts" privateMessage="Liked posts are private" />
          )}
        </div>

        <BottomNav activeTab="profile" />
      </div>
    </div>
  )
}

function PostList({ posts, emptyMessage }: { posts: Post[] | null; emptyMessage: string }) {
  if (posts === null) {
    return (
      <div className="flex justify-center pt-8">
        <Spinner />
      </div>
    )
  }
  if (posts.length === 0) {
    return <p className="text-zinc-400 text-sm text-center pt-8">{emptyMessage}</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {posts.map((post) => (
        <PostRow key={post.id} post={post} />
      ))}
    </div>
  )
}

function PostsTab({ posts }: { posts: Post[] | null }) {
  return <PostList posts={posts} emptyMessage="No posts yet." />
}

function PrivateTabContent({
  canSee,
  isOwnProfile,
  posts,
  lockedMessage,
  privateMessage,
}: {
  canSee: boolean
  isOwnProfile: boolean
  posts: Post[] | null
  lockedMessage: string
  privateMessage: string
}) {
  if (!canSee) {
    return <p className="text-zinc-400 text-sm text-center pt-8">{lockedMessage}</p>
  }
  if (!isOwnProfile) {
    return <p className="text-zinc-400 text-sm text-center pt-8">{privateMessage}</p>
  }
  return <PostList posts={posts} emptyMessage="Nothing here yet." />
}
