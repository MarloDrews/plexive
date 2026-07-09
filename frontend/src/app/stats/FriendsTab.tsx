"use client"

import { memo } from "react"
import {
  ResponsiveContainer,
  BarChart, Bar, Cell,
  ScatterChart, Scatter,
  Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts"
import Link from "next/link"
import useSWR from "swr"
import { jsonFetcher } from "@/lib/swr"
import type { FriendStats } from "./types"
import {
  DEFAULT_COLOR, RANK_COLORS, TT, AXIS, GRID,
  NoData, StatCard, CategorySection, TreemapCell,
} from "./charts"

// Short display name — truncate long usernames for chart labels.
function shortName(u: string, me: string) {
  const label = u === me ? "You" : u
  return label.length > 12 ? label.slice(0, 11) + "…" : label
}

// The Friends comparison fans out one elo + profile pair per followed user, so
// it is capped to keep the burst bounded. A backend batch endpoint returning
// elo+profile for a list of usernames in one request is the real fix; the cap
// is surfaced in the UI so a well-connected user is not shown a silent subset.
const FRIENDS_CAP = 12

async function loadFriendsStats(username: string, verifiedLevel: number): Promise<{
  participants: FriendStats[]
  totalFollowing: number
  followingEmpty: boolean
}> {
  // jsonFetcher throws on a non-2xx response. A FastAPI error body is valid
  // JSON, so a bare r.json() would "succeed" on a 404/429/500 and poison the
  // participant objects with undefined fields that crash the charts later.
  const [followingData, myEloData, myProfileData] = await Promise.all([
    jsonFetcher<{ username: string; is_verified: number }[]>(`/api/users/${username}/following`),
    jsonFetcher<{ global_rating: number | null }>(`/api/users/${username}/elo`),
    jsonFetcher<{ post_count: number; follower_count: number; following_count: number }>(
      `/api/users/${username}/profile`
    ),
  ])

  const me: FriendStats = {
    username,
    is_verified: verifiedLevel,
    global_rating: myEloData.global_rating,
    post_count: myProfileData.post_count,
    follower_count: myProfileData.follower_count,
    following_count: myProfileData.following_count,
  }

  if (!Array.isArray(followingData) || followingData.length === 0) {
    return { participants: [me], totalFollowing: myProfileData.following_count, followingEmpty: true }
  }

  const friendList = (
    await Promise.all(
      followingData.slice(0, FRIENDS_CAP).map(async (u) => {
        try {
          // Non-2xx now throws (jsonFetcher), so a rate-limited or failed
          // friend drops into the catch instead of joining as a poisoned row.
          const [eloData, profileData] = await Promise.all([
            jsonFetcher<{ global_rating: number | null }>(`/api/users/${u.username}/elo`),
            jsonFetcher<{ post_count: number; follower_count: number; following_count: number }>(
              `/api/users/${u.username}/profile`
            ),
          ])
          return {
            username: u.username,
            is_verified: u.is_verified,
            global_rating: eloData.global_rating,
            post_count: profileData.post_count,
            follower_count: profileData.follower_count,
            following_count: profileData.following_count,
          } satisfies FriendStats
        } catch {
          return null
        }
      }),
    )
  ).filter((f): f is FriendStats => f !== null)

  return {
    participants: [me, ...friendList],
    totalFollowing: myProfileData.following_count,
    followingEmpty: false,
  }
}

// memo: props are two stable scalars, so parent re-renders (swipe settle,
// saved-count updates) never rebuild the comparison charts; only this tab's
// own SWR state changes do.
function FriendsTab({ username, verifiedLevel }: { username: string; verifiedLevel: number }) {
  // Cache the fan-out in SWR so leaving and returning to this tab within a
  // session does not refire the ~27 requests. Keyed on username (+ the viewer's
  // verified level, which feeds the "me" row).
  const { data, error, isLoading, mutate } = useSWR(
    username ? ["friends-stats", username, verifiedLevel] : null,
    () => loadFriendsStats(username, verifiedLevel)
  )

  if (isLoading || (!data && !error)) {
    return (
      <div className="flex flex-col px-3 gap-3 pt-2">
        <div className="stage-pulse card h-40 w-full" />
        <div className="stage-pulse card h-64 w-full" />
      </div>
    )
  }

  const me = data?.participants.find(p => p.username === username)

  // A failed fan-out is an error with a retry, no longer conflated with the
  // "follows nobody" empty state (the fan-out shares a rate limiter, so a
  // transient 429 here used to read as "no friends").
  if (error || !data || !me) {
    return (
      <div className="flex items-center justify-center px-6 pt-16">
        <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-3">
          <p className="font-serif text-xl text-ink leading-snug">Could not load the comparison</p>
          <p className="text-ink-muted text-sm">Check your connection and try again.</p>
          <button onClick={() => mutate()} className="btn btn-primary px-5 py-2">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (data.followingEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-ink-muted">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-ink-body text-sm font-medium">No friends yet</p>
        <p className="text-ink-muted text-xs leading-relaxed max-w-[220px]">
          Follow people to compare your knowledge scores and activity with them.
        </p>
        <Link href="/search" className="btn btn-ghost text-xs px-4 py-2 mt-1">
          Find people to follow
        </Link>
      </div>
    )
  }

  const participants = data.participants
  const friends = participants.filter(p => p.username !== username)
  // True number the viewer follows vs. how many are actually compared, so the
  // subset can be labeled instead of silently presented as the whole network.
  const comparedCount = friends.length
  const isTruncated = data.totalFollowing > comparedCount
  const eloMax = Math.max(1600, ...participants.map(p => p.global_rating ?? 0))

  // Helper: sort participants by a numeric getter, descending, for charts
  function sorted(getter: (p: FriendStats) => number) {
    return [...participants].sort((a, b) => getter(b) - getter(a))
  }

  // ------- 1. Knowledge Leaderboard -------

  const eloSorted = sorted(p => p.global_rating ?? 0).filter(p => p.global_rating !== null)

  const eloProgressBars = eloSorted.length === 0 ? <NoData /> : (
    <div className="flex flex-col gap-3">
      {eloSorted.map(p => (
        <div key={p.username} className="flex items-center gap-3">
          <span className={`w-20 shrink-0 text-xs truncate ${p.username === username ? "text-lamp font-semibold" : "text-ink-dim"}`}>
            {shortName(p.username, username)}
          </span>
          <div className="flex-1 h-2 bg-white/[0.08] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, ((p.global_rating ?? 0) / eloMax) * 100)}%`, backgroundColor: p.username === username ? "#7c6fff" : DEFAULT_COLOR }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-xs text-ink-body font-mono">
            {p.global_rating !== null ? Math.round(p.global_rating) : "—"}
          </span>
        </div>
      ))}
    </div>
  )

  const eloHorizBar = eloSorted.length === 0 ? <NoData /> : (
    <ResponsiveContainer width="100%" height={Math.max(200, eloSorted.length * 36)}>
      <BarChart data={eloSorted.map(p => ({ name: shortName(p.username, username), elo: Math.round(p.global_rating ?? 0), fill: p.username === username ? "#7c6fff" : DEFAULT_COLOR }))} layout="vertical" margin={{ left: 72 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} domain={[0, eloMax]} />
        <YAxis dataKey="name" type="category" tick={AXIS} width={68} />
        <Tooltip {...TT} formatter={(v: unknown) => [String(v), "Elo"]} />
        <Bar dataKey="elo" radius={[0, 3, 3, 0]}>
          {eloSorted.map((p, i) => <Cell key={i} fill={p.username === username ? "#7c6fff" : DEFAULT_COLOR} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )

  const eloTable = eloSorted.length === 0 ? <NoData /> : (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-muted border-b border-edge">
            <th className="text-left pb-2 pr-3">#</th>
            <th className="text-left pb-2 pr-3">User</th>
            <th className="text-right pb-2">Global Elo</th>
          </tr>
        </thead>
        <tbody>
          {eloSorted.map((p, i) => (
            <tr key={p.username} className="border-b border-edge">
              <td className="py-2 pr-3 text-ink-muted">{i + 1}</td>
              <td className="py-2 pr-3">
                <Link href={`/profile/${p.username}`} className={`hover:text-ink-body transition-colors ${p.username === username ? "text-lamp font-semibold" : "text-ink"}`}>
                  {p.username === username ? "You" : p.username}
                </Link>
                {/* is_verified is a number; a bare && would render a literal 0. */}
                {p.is_verified > 0 && p.username !== username && <><span className="ml-1 text-lamp text-[10px]" aria-hidden="true">✓</span><span className="sr-only">verified</span></>}
              </td>
              <td className="py-2 text-right text-ink-body font-mono">{Math.round(p.global_rating ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const eloScatter = eloSorted.length === 0 ? <NoData /> : (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="rank" type="number" tick={AXIS} name="Rank" />
        <YAxis dataKey="elo" tick={AXIS} name="Elo" />
        <Tooltip {...TT} content={({ payload }) => {
          const d = payload?.[0]?.payload
          if (!d) return null
          return <div style={TT.contentStyle}><span style={TT.labelStyle}>{d.name}</span><br /><span>{d.elo}</span></div>
        }} cursor={false} />
        <Scatter data={eloSorted.map((p, i) => ({ rank: i + 1, elo: Math.round(p.global_rating ?? 0), name: shortName(p.username, username), fill: p.username === username ? "#7c6fff" : DEFAULT_COLOR }))} fill={DEFAULT_COLOR}>
          {eloSorted.map((p, i) => <Cell key={i} fill={p.username === username ? "#7c6fff" : DEFAULT_COLOR} />)}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  )

  // Sections 2-5 (Per-format Elo, Quiz Activity, Elo Efficiency, Knowledge
  // Breadth) were removed with the per-format elo contract: they computed
  // entirely from the always-empty formats dict the backend no longer sends.

  // ------- 2. Content (post count) -------

  const postSorted = sorted(p => p.post_count)

  const postHorizBar = (
    <ResponsiveContainer width="100%" height={Math.max(200, postSorted.length * 36)}>
      <BarChart data={postSorted.map(p => ({ name: shortName(p.username, username), posts: p.post_count, fill: p.username === username ? "#7c6fff" : DEFAULT_COLOR }))} layout="vertical" margin={{ left: 72 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} />
        <YAxis dataKey="name" type="category" tick={AXIS} width={68} />
        <Tooltip {...TT} formatter={(v: unknown) => [String(v), "Posts"]} />
        <Bar dataKey="posts" radius={[0, 3, 3, 0]}>
          {postSorted.map((p, i) => <Cell key={i} fill={p.username === username ? "#7c6fff" : DEFAULT_COLOR} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )

  const postTreemap = (
    <ResponsiveContainer width="100%" height={200}>
      <Treemap
        data={postSorted.map((p, i) => ({ name: shortName(p.username, username), size: Math.max(p.post_count, 1), fill: p.username === username ? "#7c6fff" : (RANK_COLORS[i] ?? DEFAULT_COLOR) }))}
        dataKey="size"
        nameKey="name"
        content={<TreemapCell />}
      />
    </ResponsiveContainer>
  )

  const postTable = (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-muted border-b border-edge">
            <th className="text-left pb-2 pr-3">#</th>
            <th className="text-left pb-2 pr-3">User</th>
            <th className="text-right pb-2">Posts</th>
          </tr>
        </thead>
        <tbody>
          {postSorted.map((p, i) => (
            <tr key={p.username} className="border-b border-edge">
              <td className="py-2 pr-3 text-ink-muted">{i + 1}</td>
              <td className="py-2 pr-3">
                <Link href={`/profile/${p.username}`} className={`hover:text-ink-body transition-colors ${p.username === username ? "text-lamp font-semibold" : "text-ink"}`}>
                  {p.username === username ? "You" : p.username}
                </Link>
              </td>
              <td className="py-2 text-right text-ink-body font-mono">{p.post_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  // ------- 3. Social graph (followers) -------

  const followerSorted = sorted(p => p.follower_count)

  const followerHorizBar = (
    <ResponsiveContainer width="100%" height={Math.max(200, followerSorted.length * 36)}>
      <BarChart data={followerSorted.map(p => ({ name: shortName(p.username, username), followers: p.follower_count, fill: p.username === username ? "#7c6fff" : DEFAULT_COLOR }))} layout="vertical" margin={{ left: 72 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} />
        <YAxis dataKey="name" type="category" tick={AXIS} width={68} />
        <Tooltip {...TT} formatter={(v: unknown) => [String(v), "Followers"]} />
        <Bar dataKey="followers" radius={[0, 3, 3, 0]}>
          {followerSorted.map((p, i) => <Cell key={i} fill={p.username === username ? "#7c6fff" : DEFAULT_COLOR} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )

  const socialGroupedBar = (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={participants.map(p => ({ name: shortName(p.username, username), followers: p.follower_count, following: p.following_count }))} margin={{ bottom: 40 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="name" tick={{ ...AXIS, angle: -30, textAnchor: "end" }} interval={0} />
        <YAxis tick={AXIS} />
        <Tooltip {...TT} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#8a8a8a" }} />
        <Bar dataKey="followers" name="Followers" fill="#7c6fff" radius={[2, 2, 0, 0]} />
        <Bar dataKey="following" name="Following" fill={DEFAULT_COLOR} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )

  // ------- 4. Overview mini-cards -------

  const overviewCards = (() => {
    const myEloVal = me?.global_rating
    const friendElos = friends.map(f => f.global_rating).filter((r): r is number => r !== null)
    const friendAvgElo = friendElos.length > 0 ? Math.round(friendElos.reduce((a, b) => a + b, 0) / friendElos.length) : null
    const friendAvgPosts = friends.length > 0 ? Math.round(friends.reduce((s, f) => s + f.post_count, 0) / friends.length) : 0
    return (
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Your Global Elo" value={myEloVal !== null ? Math.round(myEloVal ?? 0) : "—"} />
        <StatCard label="Friends Avg Elo" value={friendAvgElo !== null ? friendAvgElo : "—"} />
        <StatCard label="Your Posts" value={me?.post_count ?? 0} />
        <StatCard label="Friends Avg Posts" value={friendAvgPosts} />
        <StatCard label="Friends Following" value={data.totalFollowing} />
      </div>
    )
  })()

  return (
    <div>
      {/* Overview */}
      <div className="card mx-3 mb-3 px-4 py-4">
        <div className="label-caps text-ink-dim mb-3">Overview</div>
        {overviewCards}
        {isTruncated && (
          <p className="text-ink-muted text-xs mt-3">
            Comparing {comparedCount} of the {data.totalFollowing} people you follow.
          </p>
        )}
      </div>

      {/* Knowledge Leaderboard */}
      <CategorySection
        title="Knowledge Leaderboard (Global Elo)"
        charts={[
          { label: "Progress bars", component: eloProgressBars },
          { label: "Horizontal bar", component: eloHorizBar },
          { label: "Table", component: eloTable },
          { label: "Scatter", component: eloScatter },
        ]}
      />

      {/* Content */}
      <CategorySection
        title="Content Created"
        charts={[
          { label: "Horizontal bar", component: postHorizBar },
          { label: "Table", component: postTable },
          { label: "Treemap", component: postTreemap },
        ]}
      />

      {/* Social */}
      <CategorySection
        title="Social"
        charts={[
          { label: "Followers", component: followerHorizBar },
          { label: "Followers & Following", component: socialGroupedBar },
        ]}
      />
    </div>
  )
}

export default memo(FriendsTab)
