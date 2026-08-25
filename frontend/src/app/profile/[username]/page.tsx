"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import useSWR from "swr"
import { useAuth } from "@/lib/auth"
import { apiFetch } from "@/lib/api"
import { getSavedPostIds } from "@/lib/savedPosts"
import { getLikedPostIds } from "@/lib/likedPosts"
import { fetchPostsByIds } from "@/lib/fetchPosts"
import { useSwipeTabs } from "@/lib/useSwipeTabs"
import { tabPanelProps } from "@/lib/tablist"
import BottomNav from "@/components/BottomNav"
import SegmentedTabs from "@/components/SegmentedTabs"
import PostRow from "@/components/PostRow"
import Spinner from "@/components/Spinner"
import ProfileBadgeCard from "@/components/ProfileBadgeCard"
import FollowListSheet, { type ListUser } from "@/components/FollowListSheet"

const PROFILE_TABS_ID = "profile-tabs"

interface ProfileData {
  username: string
  is_verified: number
  is_private: boolean
  bio: string | null
  avatar_url: string | null
  avatar_frame_id: number | null
  // Equipped Arena badge; the /profile endpoint sends it for any user, so
  // foreign profiles show their badge too. The own-profile view still reads
  // the auth user's badge_id so an equip shows without a refetch.
  badge_id?: number | null
  follower_count: number
  following_count: number
  post_count: number
  follow_status: string | null
}

// The knowledge score is one unified rating; the backend no longer sends a
// per-format breakdown.
interface EloData {
  global_rating: number | null
}

interface Post {
  id: number
  format: string
  title: string
  status: string
  created_at: string
}

type Tab = "posts" | "saved" | "liked"

const TAB_ORDER: Tab[] = ["posts", "saved", "liked"]

export default function PublicProfilePage() {
  const params = useParams()
  // useParams returns the percent-encoded route segment; without decoding, a
  // legacy username with encodable characters breaks isOwnProfile and every
  // API path built from it (BUG-107/M152).
  const username = decodeURIComponent(params.username as string)
  const router = useRouter()
  const { user } = useAuth()

  const [savedPosts, setSavedPosts] = useState<Post[] | null>(null)
  const [likedPosts, setLikedPosts] = useState<Post[] | null>(null)
  const [followLoading, setFollowLoading] = useState(false)
  const [listOpen, setListOpen] = useState<"followers" | "following" | null>(null)
  const [listUsers, setListUsers] = useState<ListUser[] | null>(null)

  // Swipeable Posts/Saved/Liked pager; the lazy saved/liked fetch effects
  // below key on the derived activeTab, so they fire on swipe-settle the
  // same way they fired on tab click.
  const { activeIndex, pagerRef, indicatorRef, tabRefs, selectTab } = useSwipeTabs({ count: 3 })
  const activeTab = TAB_ORDER[activeIndex]

  // The pager's natural height is its tallest page, which would leave dead
  // scroll space under short tabs; clamp a wrapper to the active page's
  // measured height instead (ResizeObserver catches async post loads). The
  // height is written to the wrapper node imperatively: routing it through
  // state re-rendered the whole profile page on every content resize (async
  // post loads, trickling images) just to update one inline style.
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const pagerClampRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const page = pageRefs.current[activeIndex]
    if (!page) return
    const measure = () => {
      const wrapper = pagerClampRef.current
      if (wrapper) wrapper.style.height = `${page.offsetHeight}px`
    }
    measure()
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(page)
    return () => resizeObserver.disconnect()
  }, [activeIndex])

  const isOwnProfile = user?.username === username

  // Profile, elo and posts via SWR: repeat visits render the cached data
  // instantly and refresh silently in the background. Error mapping mirrors
  // the previous fetch handlers exactly.
  const {
    data: profile,
    error: profileError,
    mutate: mutateProfile,
  } = useSWR<ProfileData>(`/api/users/${username}/profile`)
  const error = profileError ? "Profile not found." : ""

  const { data: eloData } = useSWR<EloData>(`/api/users/${username}/elo`)
  const elo = eloData ?? null

  function openList(kind: "followers" | "following") {
    setListOpen(kind)
    setListUsers(null)
    apiFetch(`/api/users/${username}/${kind}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setListUsers)
      .catch(() => setListUsers([]))
  }

  const { data: postsData, error: postsError } = useSWR<Post[]>(`/api/feed/user/${username}`)
  const posts: Post[] | null = postsError ? [] : postsData ?? null

  // Saved/liked tabs: only load for own profile from localStorage, and only
  // when the tab is first opened — each saved/liked id costs one full
  // GET /api/posts/{id}, so fetching them on mount made every own-profile
  // visit pay for tabs that were never opened. The null state still renders
  // the existing spinner on first open.
  useEffect(() => {
    if (!isOwnProfile || activeTab !== "saved" || savedPosts !== null) return
    const ids = getSavedPostIds()
    if (ids.length === 0) { setSavedPosts([]); return }
    fetchPostsByIds<Post>(ids).then((results) => setSavedPosts(results.filter(Boolean) as Post[]))
  }, [isOwnProfile, activeTab, savedPosts])

  useEffect(() => {
    if (!isOwnProfile || activeTab !== "liked" || likedPosts !== null) return
    const ids = getLikedPostIds()
    if (ids.length === 0) { setLikedPosts([]); return }
    fetchPostsByIds<Post>(ids).then((results) => setLikedPosts(results.filter(Boolean) as Post[]))
  }, [isOwnProfile, activeTab, likedPosts])

  async function handleFollow() {
    if (!profile) return
    setFollowLoading(true)
    try {
      // Optimistic update written into the SWR cache only when the write
      // succeeds (revalidate: false keeps trusting the computed counts). On a
      // failed write (429 rate limit, 400 self/duplicate, stale 404) or a
      // network error, revalidate the profile key so the button reflects the
      // server's real state instead of a guess.
      const followStatus = profile.follow_status
      if (followStatus === "accepted" || followStatus === "pending") {
        const r = await apiFetch(`/api/users/${username}/follow`, { method: "DELETE" })
        if (r.ok) {
          mutateProfile((p) => p ? { ...p, follow_status: "none", follower_count: Math.max(0, p.follower_count - (followStatus === "accepted" ? 1 : 0)) } : p, { revalidate: false })
        } else {
          mutateProfile()
        }
      } else {
        const r = await apiFetch(`/api/users/${username}/follow`, { method: "POST" })
        if (r.ok) {
          const data = await r.json()
          mutateProfile((p) => p ? { ...p, follow_status: data.status, follower_count: data.status === "accepted" ? p.follower_count + 1 : p.follower_count } : p, { revalidate: false })
        } else {
          mutateProfile()
        }
      }
    } catch {
      mutateProfile()
    } finally {
      setFollowLoading(false)
    }
  }

  if (error) {
    return (
      <div className="h-[100dvh] bg-surface-0 flex justify-center">
        <div className="w-full max-w-[430px] flex items-center justify-center">
          <p className="text-ink-dim text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="h-[100dvh] bg-surface-0 flex justify-center">
        <div className="w-full max-w-[430px] flex items-center justify-center">
          <Spinner />
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] bg-surface-0 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative">
        {/* Scrolling moved to an inner div so the floating dock and the
            followers sheet stay pinned while the content scrolls. */}
        <div className="h-full overflow-y-auto pb-24">

        {/* Header */}
        <div className="flex items-center px-4 pt-4 pb-2">
          <button
            onClick={() => router.back()}
            className="btn-icon"
            aria-label="Go back"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="flex-1 text-center text-ink font-semibold text-base">{username}</span>
          {isOwnProfile ? (
            <button
              onClick={() => router.push("/profile")}
              className="btn-icon"
              aria-label="Settings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          ) : (
            <button className="btn-icon" aria-label="More options">
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
          {/* Badge tile (top-left) + stats (right) */}
          <div className="flex gap-3 items-stretch mb-3">
            {/* Badge tile, arena waiting-room style. Own profile takes its badge
                from the auth user (the /profile endpoint may not send one). */}
            <ProfileBadgeCard
              username={username}
              avatarUrl={profile.avatar_url}
              badgeId={isOwnProfile ? (user?.badge_id ?? null) : (profile.badge_id ?? null)}
              verified={profile.is_verified}
            />

            {/* Stats about the person */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <h1 className="sr-only">{username}</h1>
              {/* Post / Followers / Following share one row at the same height */}
              <div className="grid grid-cols-3 gap-x-3">
                <div className="text-center">
                  <p className="text-ink font-bold text-lg font-mono">{profile.post_count}</p>
                  <p className="text-ink-muted text-xs">Posts</p>
                </div>
                <button className="text-center" onClick={() => openList("followers")}>
                  <p className="text-ink font-bold text-lg font-mono">{profile.follower_count}</p>
                  <p className="text-ink-muted text-xs">Followers</p>
                </button>
                <button className="text-center" onClick={() => openList("following")}>
                  <p className="text-ink font-bold text-lg font-mono">{profile.following_count}</p>
                  <p className="text-ink-muted text-xs">Following</p>
                </button>
              </div>
              {/* Knowledge score sits on its own line below the social counts */}
              <div className="text-center mt-3">
                <p className="text-lamp font-bold text-lg font-mono">
                  {elo?.global_rating ?? "—"}
                </p>
                <p className="text-ink-muted text-xs">Knowledge</p>
              </div>
            </div>
          </div>

          {/* Private label */}
          {profile.is_private && (
            <p className="text-ink-muted text-xs mb-1">Private account</p>
          )}

          {/* Bio */}
          {profile.bio && (
            <p className="text-ink-body text-sm mb-3">{profile.bio}</p>
          )}

          {/* Follow / Edit Profile button */}
          {isOwnProfile ? (
            <Link
              href="/profile"
              className="btn btn-ghost w-full py-2"
            >
              Edit Profile
            </Link>
          ) : user ? (
            <button
              onClick={handleFollow}
              disabled={followLoading}
              className={`btn w-full py-2 ${followLoading ? "opacity-50" : ""} ${
                profile.follow_status === "accepted" || profile.follow_status === "pending"
                  ? "btn-ghost"
                  : "btn-primary"
              }`}
            >
              {profile.follow_status === "accepted" ? "Following" : profile.follow_status === "pending" ? "Requested" : "Follow"}
            </button>
          ) : (
            <Link
              href="/login"
              className="btn btn-primary w-full py-2"
            >
              Follow
            </Link>
          )}
        </div>

        {/* Own profile: swipeable Posts/Saved/Liked pager. Foreign profile:
            Posts only — Saved and Liked are private, so the switcher and
            the swipe gesture have no place there. */}
        {isOwnProfile ? (
          <>
            {/* Tab bar — frosted segmented capsule with sliding indicator */}
            <SegmentedTabs
              className="mx-3 mt-2"
              labels={["Posts", "Saved", "Liked"]}
              activeIndex={activeIndex}
              onSelect={selectTab}
              tabRefs={tabRefs}
              indicatorRef={indicatorRef}
              idBase={PROFILE_TABS_ID}
              ariaLabel="Profile sections"
            />

            {/* Tab content — swipeable pager inside the vertical scroller;
                the wrapper height-clamps to the active page so short tabs
                don't inherit the tallest page's scroll length. */}
            <div
              ref={pagerClampRef}
              className="overflow-hidden transition-[height] duration-200"
            >
              <div
                ref={pagerRef}
                className="flex items-start overflow-x-scroll overflow-y-hidden snap-x snap-mandatory"
              >
                <div ref={(el) => { pageRefs.current[0] = el }} {...tabPanelProps(PROFILE_TABS_ID, 0, activeIndex === 0)} className="w-full shrink-0 snap-start px-4 pt-3 min-h-[160px]">
                  <PostsTab posts={posts} />
                </div>
                <div ref={(el) => { pageRefs.current[1] = el }} {...tabPanelProps(PROFILE_TABS_ID, 1, activeIndex === 1)} className="w-full shrink-0 snap-start px-4 pt-3 min-h-[160px]">
                  <PostList posts={savedPosts} emptyMessage="Nothing here yet." />
                </div>
                <div ref={(el) => { pageRefs.current[2] = el }} {...tabPanelProps(PROFILE_TABS_ID, 2, activeIndex === 2)} className="w-full shrink-0 snap-start px-4 pt-3 min-h-[160px]">
                  <PostList posts={likedPosts} emptyMessage="Nothing here yet." />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="px-4 pt-3 min-h-[160px]">
            <PostsTab posts={posts} />
          </div>
        )}
        </div>

        <FollowListSheet
          open={listOpen}
          onClose={() => setListOpen(null)}
          users={listUsers}
          emptyMessage={
            profile.is_private && profile.follow_status !== "accepted" && !isOwnProfile
              ? "This account is private."
              : "Nothing here yet."
          }
        />

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
    return <p className="text-ink-muted text-sm text-center pt-8">{emptyMessage}</p>
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

