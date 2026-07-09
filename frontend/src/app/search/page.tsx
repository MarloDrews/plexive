"use client"

import { memo, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { type Post } from "@/components/PostCard"
import { fcStr } from "@/types/post"
import { FORMAT_IDS, FORMAT_STYLES, type FormatId } from "@/lib/formats"
import { apiFetch } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useSwipeTabs } from "@/lib/useSwipeTabs"
import { tabPanelProps } from "@/lib/tablist"
import BottomNav from "@/components/BottomNav"
import SegmentedTabs from "@/components/SegmentedTabs"
import VerifiedBadge from "@/components/VerifiedBadge"
import Avatar from "@/components/Avatar"

const SEARCH_TABS_ID = "search-tabs"

const FORMAT_CHIPS: { label: string; value: FormatId | "" }[] = [
  { label: "All", value: "" },
  ...FORMAT_IDS.map((id) => ({ label: FORMAT_STYLES[id].label, value: id })),
]

type FormatValue = FormatId | ""

interface UserResult {
  username: string
  is_verified: number
  is_private: boolean
  bio: string | null
  avatar_url: string | null
  is_self: boolean
  follow_status: string | null
}

function Snippet({ post }: { post: Post }) {
  const text = fcStr(post.feed_card, "essence") || fcStr(post.feed_card, "headline")
  const snippet = text.length > 120 ? text.slice(0, 120) + "…" : text
  return <p className="text-ink-dim text-xs mt-1 line-clamp-2">{snippet}</p>
}

function FormatBadge({ format }: { format: string }) {
  const style = FORMAT_STYLES[format as FormatId]
  if (!style) return null
  return (
    <span className={`label-caps ${style.text}`}>
      {style.badge}
    </span>
  )
}

function UserRow({ user, loggedIn }: { user: UserResult; loggedIn: boolean }) {
  const [followStatus, setFollowStatus] = useState(user.follow_status)
  const [busy, setBusy] = useState(false)

  async function toggleFollow() {
    if (busy) return
    setBusy(true)
    try {
      if (followStatus === "accepted" || followStatus === "pending") {
        const r = await apiFetch(`/api/users/${user.username}/follow`, { method: "DELETE" })
        // Only drop to "none" when the unfollow actually succeeded.
        if (r.ok) setFollowStatus("none")
      } else {
        const r = await apiFetch(`/api/users/${user.username}/follow`, { method: "POST" })
        if (r.ok) {
          const d = await r.json()
          setFollowStatus(d.status)
        }
      }
    } catch {
      // Swallow so a failed toggle is not an unhandled rejection.
    } finally {
      setBusy(false)
    }
  }

  const following = followStatus === "accepted"
  const requested = followStatus === "pending"

  // The row is a layout div with two discrete controls, not a button wrapping
  // a button (A11Y-009). The profile link stretches across the row via the
  // ::after overlay, so the whole card is still one click target, while the
  // follow button sits above it and stays independently focusable.
  return (
    <div className="relative card px-4 py-3 flex items-center gap-3 hover:bg-white/[0.07] transition-colors duration-150">
      <Avatar username={user.username} avatarUrl={user.avatar_url} size={44} verified={user.is_verified} />
      <div className="flex-1 min-w-0">
        <p className="flex items-center gap-1.5 text-ink text-sm font-semibold truncate">
          <Link
            href={`/profile/${user.username}`}
            className="after:absolute after:inset-0 after:rounded-3xl hover:underline"
          >
            @{user.username}
          </Link>
          {user.is_verified > 0 && <VerifiedBadge size={14} level={user.is_verified} />}
        </p>
        {user.bio && <p className="text-ink-muted text-xs truncate">{user.bio}</p>}
        {user.is_private && !user.bio && <p className="text-ink-muted text-xs">Private account</p>}
      </div>
      {loggedIn && !user.is_self && (
        <button
          onClick={toggleFollow}
          disabled={busy}
          aria-pressed={following || requested}
          aria-label={`${following ? "Unfollow" : requested ? "Cancel follow request to" : "Follow"} @${user.username}`}
          className={`btn relative z-10 shrink-0 px-3 py-1.5 text-xs ${busy ? "opacity-50" : ""} ${
            following || requested
              ? "btn-ghost"
              : "btn-primary"
          }`}
        >
          {following ? "Following" : requested ? "Requested" : "Follow"}
        </button>
      )}
    </div>
  )
}

// Memoized result lists: a keystroke re-renders the page (query state), but
// these skip until their fetched arrays actually change, so rows (and the
// UserRow follow state) are never remounted or reconciled mid-typing.
//
// The post link and the author link are siblings, not an anchor nested inside
// a button (A11Y-009). The post link stretches over the whole card through its
// ::after overlay; the author link sits above it on its own z-layer, so both
// are focusable and neither swallows the other's activation.
const PostResultsList = memo(function PostResultsList({ results }: { results: Post[] }) {
  return (
    <ul className="flex flex-col gap-2 pt-2">
      {results.map((post) => (
        <li
          key={post.id}
          className="relative card px-4 py-3 hover:bg-white/[0.07] transition-colors duration-150"
        >
          <FormatBadge format={post.format} />
          <p className="text-ink font-serif font-medium text-[15px] mt-0.5 line-clamp-2">
            <Link href={`/post/${post.id}`} className="after:absolute after:inset-0 after:rounded-3xl">
              {post.title}
            </Link>
          </p>
          <p className="flex items-center gap-1 text-ink-muted text-xs mt-0.5">
            {post.is_user_content && post.author_username ? (
              <Link href={`/profile/${post.author_username}`} className="relative z-10 hover:text-ink-dim transition-colors">
                @{post.author_username}
              </Link>
            ) : "Deepscroll"}
            {post.is_user_content && post.author_is_verified != null && post.author_is_verified > 0 && <VerifiedBadge size={14} level={post.author_is_verified} />}
          </p>
          <Snippet post={post} />
        </li>
      ))}
    </ul>
  )
})

const UserResultsList = memo(function UserResultsList({
  users,
  loggedIn,
}: {
  users: UserResult[]
  loggedIn: boolean
}) {
  return (
    <ul className="flex flex-col gap-2 pt-2">
      {users.map((u) => (
        <li key={u.username}>
          <UserRow user={u} loggedIn={loggedIn} />
        </li>
      ))}
    </ul>
  )
})

export default function SearchPage() {
  const router = useRouter()
  const { user: authUser } = useAuth()
  const [query, setQuery] = useState("")
  const [formatFilter, setFormatFilter] = useState<FormatValue>("")
  const [results, setResults] = useState<Post[] | null>(null)
  const [userResults, setUserResults] = useState<UserResult[] | null>(null)
  // Posts and accounts load in separate effects: only the posts search depends
  // on the format filter, so a format-chip tap no longer refires the identical
  // user search. Each carries its own loading flag and stale-response guard.
  const [postsLoading, setPostsLoading] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [postsError, setPostsError] = useState(false)
  const [usersError, setUsersError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Monotonic counters so a slow response for an earlier query can never
  // overwrite the results of a later one (the debounce only cancels the timer,
  // not an in-flight request).
  const postsSeq = useRef(0)
  const usersSeq = useRef(0)

  // Posts/Accounts is no longer a pre-search mode: one search fetches both,
  // and this swipeable switcher just flips which fetched list is visible.
  const { activeIndex, pagerRef, indicatorRef, tabRefs, selectTab, refreshIndicator } =
    useSwipeTabs({ count: 2 })

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Posts search - depends on the format filter.
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults(null)
      setPostsLoading(false)
      return
    }
    const seq = ++postsSeq.current
    const timer = setTimeout(async () => {
      // Loading starts only when the debounced request actually fires; the
      // previous results stay on screen while it is in flight (the skeletons
      // used to swap in synchronously on every keystroke).
      setPostsLoading(true)
      setPostsError(false)
      try {
        const params = new URLSearchParams({ q: trimmed })
        if (formatFilter) params.set("format", formatFilter)
        const res = await apiFetch(`/api/search?${params}`)
        if (!res.ok) throw new Error(`status ${res.status}`)
        const data = (await res.json()) as Post[]
        if (seq === postsSeq.current) setResults(data)
      } catch {
        if (seq === postsSeq.current) setPostsError(true)
      } finally {
        if (seq === postsSeq.current) setPostsLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, formatFilter])

  // User search - keyed on the query only, so format-chip taps do not refire it.
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setUserResults(null)
      setUsersLoading(false)
      return
    }
    const seq = ++usersSeq.current
    const timer = setTimeout(async () => {
      setUsersLoading(true)
      setUsersError(false)
      try {
        const res = await apiFetch(`/api/search/users?${new URLSearchParams({ q: trimmed })}`)
        if (!res.ok) throw new Error(`status ${res.status}`)
        const data = (await res.json()) as UserResult[]
        if (seq === usersSeq.current) setUserResults(data)
      } catch {
        if (seq === usersSeq.current) setUsersError(true)
      } finally {
        if (seq === usersSeq.current) setUsersLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const hasQuery = !!query.trim()

  // The capsule only mounts once a query exists, after the hook's initial
  // measurement ran — ask it to re-measure so the indicator appears.
  useEffect(() => {
    if (hasQuery) refreshIndicator()
  }, [hasQuery, refreshIndicator])

  const emptyPosts = results !== null && results.length === 0
  const emptyUsers = userResults !== null && userResults.length === 0

  // Loading and idle states render identically on both pager pages.
  const loadingSlabs = (
    <div className="flex flex-col gap-2 pt-2">
      <div className="stage-pulse card h-20 w-full" />
      <div className="stage-pulse card h-20 w-full" />
      <div className="stage-pulse card h-20 w-full" />
    </div>
  )
  const idleMessage = (
    <div className="flex flex-col items-center justify-center pt-20 text-center px-6">
      <p className="text-ink-muted text-sm">Search posts, books, people…</p>
    </div>
  )
  const errorMessage = (
    <div className="flex flex-col items-center justify-center pt-20 text-center px-6 gap-2">
      <p className="text-ink font-serif font-medium text-base">Something went wrong</p>
      <p className="text-ink-muted text-xs">Check your connection and try again.</p>
    </div>
  )
  const pageClass =
    "w-full shrink-0 snap-start h-full overflow-y-auto overscroll-y-contain px-3 pb-24"

  return (
    <div className="h-[100dvh] bg-surface-0 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative flex flex-col">

        {/* The search field is the header; sr-only h1 names the page. */}
        <h1 className="sr-only">Search</h1>

        {/* Top bar: back + search input + post-search switcher */}
        <div className="shrink-0 z-20 bg-surface-0 px-3 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="btn-icon shrink-0"
              aria-label="Go back"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <div className="relative flex-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                aria-label="Search posts, books and people"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search posts, books, people…"
                className="field rounded-full text-sm pl-9 pr-9 py-2.5"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors cursor-pointer"
                  aria-label="Clear search"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Posts | Accounts — appears after a query exists and filters the
              already-fetched results, swipeable like the result pager. */}
          {hasQuery && (
            <SegmentedTabs
              className="mt-2"
              labels={["Posts", "Accounts"]}
              activeIndex={activeIndex}
              onSelect={selectTab}
              tabRefs={tabRefs}
              indicatorRef={indicatorRef}
              idBase={SEARCH_TABS_ID}
              ariaLabel="Search results"
            />
          )}

          {/* Format chips (refine the posts search server-side) */}
          {activeIndex === 0 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
              {FORMAT_CHIPS.map((chip) => {
                const isActive = formatFilter === chip.value
                const style = chip.value ? FORMAT_STYLES[chip.value] : null
                return (
                  <button
                    key={chip.value}
                    onClick={() => setFormatFilter(chip.value)}
                    aria-pressed={isActive}
                    className={`chip shrink-0 px-3 py-1 text-xs ${
                      isActive
                        ? style
                          ? `bg-white/[0.12] ${style.text}`
                          : "chip-on"
                        : "chip-off"
                    }`}
                  >
                    {chip.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Results — swipeable pager: Posts | Accounts */}
        <div
          ref={pagerRef}
          className="flex-1 min-h-0 flex overflow-x-scroll overflow-y-hidden snap-x snap-mandatory"
        >
          {/* Skeletons appear only when there is nothing to show yet; with
              previous results on screen they stay visible while the debounced
              refetch is in flight and swap in place when it lands. */}
          <div className={pageClass} {...tabPanelProps(SEARCH_TABS_ID, 0, activeIndex === 0)}>
            {!hasQuery ? (
              idleMessage
            ) : postsLoading && results === null ? (
              loadingSlabs
            ) : postsError ? (
              errorMessage
            ) : emptyPosts ? (
              <div className="flex flex-col items-center justify-center pt-20 text-center px-6 gap-2">
                <p className="text-ink font-serif font-medium text-base">No results for &ldquo;{query}&rdquo;</p>
                <p className="text-ink-muted text-xs">Try a different word or format</p>
              </div>
            ) : results !== null ? (
              <PostResultsList results={results} />
            ) : (
              loadingSlabs
            )}
          </div>

          <div className={pageClass} {...tabPanelProps(SEARCH_TABS_ID, 1, activeIndex === 1)}>
            {!hasQuery ? (
              idleMessage
            ) : usersLoading && userResults === null ? (
              loadingSlabs
            ) : usersError ? (
              errorMessage
            ) : emptyUsers ? (
              <div className="flex flex-col items-center justify-center pt-20 text-center px-6 gap-2">
                <p className="text-ink font-serif font-medium text-base">No results for &ldquo;{query}&rdquo;</p>
                <p className="text-ink-muted text-xs">Try a different username</p>
              </div>
            ) : userResults !== null ? (
              <UserResultsList users={userResults} loggedIn={!!authUser} />
            ) : (
              loadingSlabs
            )}
          </div>
        </div>

        <BottomNav activeTab="search" />
      </div>
    </div>
  )
}
