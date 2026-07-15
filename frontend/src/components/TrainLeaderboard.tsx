"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { useAuth } from "@/lib/auth"
import { jsonFetcher } from "@/lib/swr"
import { LABEL_CAPS } from "./stage"

// The Train intro leaderboard. Ranks users by the unified knowledge score (the
// same number the marathon and profile show) via GET /api/train/leaderboard,
// with a Friends/Global toggle:
//   - Global: everyone, top 50, plus a pinned "You" row when the viewer sits
//     outside the top 50 (from the response's `me`).
//   - Friends: the viewer plus the accounts they follow; requires login.
// The lamp accent marks the viewer's own row throughout, matching the stats
// FriendsTab Elo leaderboard.

type Scope = "friends" | "global"

interface LbEntry {
  rank: number | null
  username: string
  is_verified: number
  rating: number | null
  is_me: boolean
}

interface LbMe {
  rank: number
  rating: number
  username: string
}

interface LbResponse {
  scope: string
  entries: LbEntry[]
  me: LbMe | null
  total: number
  truncated: boolean
}

// Lamp-tinted background for the viewer's own row (matches Marathon's option
// coloring, which uses inline rgba rather than a Tailwind arbitrary value).
const ME_BG = "rgb(124 111 255 / 0.12)"

// One ranked row. `you` styles the viewer's own row in the lamp accent and
// swaps the name for "You"; the verified check only shows for other people.
function Row({ entry }: { entry: LbEntry }) {
  const you = entry.is_me
  return (
    <div
      className="flex items-center gap-3 px-2.5 py-2 rounded-xl"
      style={you ? { backgroundColor: ME_BG } : undefined}
    >
      <span className={`w-7 shrink-0 text-right font-mono text-[13px] ${you ? "text-lamp" : "text-ink-muted"}`}>
        {entry.rank ?? "—"}
      </span>
      <span className={`flex-1 truncate text-sm ${you ? "text-lamp font-semibold" : "text-ink-body"}`}>
        {you ? "You" : entry.username}
        {/* is_verified is a number; a bare && would render a literal 0. */}
        {entry.is_verified > 0 && !you && (
          <>
            <span className="ml-1 text-lamp text-[10px]" aria-hidden="true">✓</span>
            <span className="sr-only">verified</span>
          </>
        )}
      </span>
      <span className={`shrink-0 font-mono text-[13px] ${you ? "text-lamp" : "text-ink-body"}`}>
        {entry.rating ?? "—"}
      </span>
    </div>
  )
}

export default function TrainLeaderboard() {
  const { user } = useAuth()
  const [scope, setScope] = useState<Scope>("global")

  // Friends needs a logged-in identity; skip the fetch (null key) when a guest
  // has Friends selected and show a login prompt instead.
  const key =
    scope === "friends"
      ? user
        ? "/api/train/leaderboard?scope=friends"
        : null
      : "/api/train/leaderboard?scope=global"
  const { data, error, isLoading, mutate } = useSWR<LbResponse>(key, jsonFetcher)

  // The viewer's row is already inline when they rank in the returned list; only
  // pin a separate "You" line when `me` exists but is not among the rows (global,
  // outside the top 50).
  const meInList = data?.entries.some((e) => e.is_me) ?? false
  const showPinnedMe = !!data?.me && !meInList

  return (
    <div className="card px-4 py-4 flex flex-col gap-3">
      <div className={LABEL_CAPS}>Leaderboard</div>

      {/* Scope toggle — two toggle buttons rather than a full tablist, so it
          needs no roving-tabindex keyboard contract. aria-pressed carries the
          selected state. */}
      <div role="group" aria-label="Leaderboard scope" className="rounded-full bg-white/[0.06] flex items-center p-1 gap-1">
        {(["friends", "global"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={scope === s}
            onClick={() => setScope(s)}
            className={`flex-1 h-8 rounded-full text-[13px] transition-colors duration-150 ${
              scope === s
                ? "bg-white/[0.12] text-ink font-semibold"
                : "text-ink-muted font-medium hover:text-ink-dim"
            }`}
          >
            {s === "friends" ? "Friends" : "Global"}
          </button>
        ))}
      </div>

      {scope === "friends" && !user ? (
        <p className="text-ink-dim text-[13px] py-2">
          <Link href="/login" className="text-lamp font-semibold">
            Log in
          </Link>{" "}
          to compare knowledge scores with people you follow.
        </p>
      ) : isLoading || (!data && !error) ? (
        <div className="flex flex-col gap-2">
          <div className="stage-pulse h-8 w-full rounded-xl" />
          <div className="stage-pulse h-8 w-full rounded-xl" />
          <div className="stage-pulse h-8 w-full rounded-xl" />
        </div>
      ) : error || !data ? (
        <div className="flex flex-col items-start gap-2 py-1">
          <p className="text-ink-dim text-[13px]">Could not load the leaderboard.</p>
          <button onClick={() => mutate()} className="btn btn-ghost text-xs px-4 py-2">
            Retry
          </button>
        </div>
      ) : data.entries.length === 0 ? (
        <p className="text-ink-dim text-[13px] py-2">
          {scope === "global"
            ? "No scores yet. Answer a few questions to get on the board."
            : "Nobody to rank yet — play Train to earn a score."}
        </p>
      ) : scope === "friends" && !data.entries.some((e) => !e.is_me) ? (
        // Friends board with only the viewer in it: nudge them to follow people.
        <div className="flex flex-col items-start gap-2 py-1">
          <p className="text-ink-dim text-[13px]">Follow people to compare your knowledge scores.</p>
          <Link href="/search" className="btn btn-ghost text-xs px-4 py-2">
            Find people to follow
          </Link>
        </div>
      ) : (
        <>
          {/* Cap the panel height so a long global board stays compact; the list
              scrolls inside instead of stretching the intro. */}
          <div className="flex flex-col gap-0.5 max-h-[300px] overflow-y-auto overscroll-y-contain">
            {data.entries.map((e) => (
              <Row key={`${e.rank}-${e.username}`} entry={e} />
            ))}
          </div>
          {showPinnedMe && data.me && (
            <>
              <div className="border-t border-edge" />
              <Row
                entry={{
                  rank: data.me.rank,
                  username: data.me.username,
                  rating: data.me.rating,
                  is_verified: 0,
                  is_me: true,
                }}
              />
            </>
          )}
          {data.truncated && (
            <p className="text-ink-muted text-[11px] pt-1">
              {scope === "global"
                ? `Showing the top ${data.entries.length} of ${data.total}.`
                : "Comparing your most recent follows."}
            </p>
          )}
        </>
      )}
    </div>
  )
}
