"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/app/lib/auth"
import { apiFetch } from "@/app/lib/api"
import { useBattleSocket, type BattleInbound } from "@/app/lib/battleSocket"
import { buildSequence } from "@/lib/battle/seededQuestions"
import type { MarathonQuestion } from "@/types/train"
import NumberSlider from "./NumberSlider"
import { GlowCard, MessageSlab, LABEL_CAPS } from "./stage"
import Avatar from "@/components/Avatar"
import VerifiedBadge from "@/components/VerifiedBadge"

// The Battle tab for web: a real-time 1v1 quiz duel against a friend. Ported
// from the mobile Battle (mobile/src/components/battle/Battle.tsx). It mirrors
// the Train marathon's look (frosted glow slabs, mono labels) but instead of a
// solo Elo climb, two accounts race through the SAME questions and a winner is
// declared. You find an opponent with the user search (the same
// /api/search/users the search screen uses), click Battle, and both clients play
// in lockstep over a WebSocket (app/lib/battleSocket.ts) that only agrees a
// shared seed -- both clients derive the identical question sequence locally
// (mock phase, see @/types/train). Battle needs an account (the socket
// authenticates by JWT like chat), so guests see a login prompt.
//
// State machine:
//   lobby -> waiting -> question <-> feedback -> done -> summary
// where being challenged jumps straight to `question` (battle_start arrives on
// both clients). Edge events (opponent left / unavailable / error) drop back to
// the lobby with a message.

type Stage = "lobby" | "waiting" | "question" | "feedback" | "done" | "summary"

interface UserResult {
  username: string
  avatar_url: string | null
  is_verified: number
  is_self?: boolean
}

interface Props {
  // Switch back to the feed from the summary's secondary button.
  onExit?: () => void
}

// A label-caps stat (tiny label over a mono value), tinted by `color`.
function ScoreStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 max-w-[130px]">
      <span className={`${LABEL_CAPS} truncate max-w-full`}>{label}</span>
      <span className="font-mono text-[26px] leading-none" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

export default function Battle({ onExit }: Props) {
  const { user } = useAuth()

  const [stage, setStage] = useState<Stage>("lobby")
  const [message, setMessage] = useState("")

  // User search (lobby).
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<UserResult[] | null>(null)
  const [searching, setSearching] = useState(false)

  // The people the user follows, shown as a tappable list in the lobby so a
  // friend can be challenged straight away without typing a search.
  const [friends, setFriends] = useState<UserResult[] | null>(null)
  const [friendsLoading, setFriendsLoading] = useState(false)

  // The paired opponent's username (for the live strip, summary and rematch).
  const [opponent, setOpponent] = useState("")

  // Duel state. `seq` is the shared question sequence both clients derive from
  // the seed; both players walk it at their own pace.
  const [seq, setSeq] = useState<MarathonQuestion[]>([])
  const [count, setCount] = useState(0)
  const [index, setIndex] = useState(0)
  const [myScore, setMyScore] = useState(0)
  const [oppScore, setOppScore] = useState(0)
  const [oppDone, setOppDone] = useState(false)

  // Per-question answer state.
  const [selected, setSelected] = useState<number | null>(null)
  const [sliderValue, setSliderValue] = useState(0)
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)

  // Numeric questions start the slider at a random step (never anchored on a
  // hintable midpoint), exactly like the Train marathon.
  function startSlider(q: MarathonQuestion | undefined) {
    if (q && q.kind === "numeric") {
      const step = q.step ?? 1
      const steps = Math.floor((q.max - q.min) / step)
      const rand = q.min + Math.round(Math.random() * steps) * step
      setSliderValue(Math.min(q.max, Math.max(q.min, rand)))
    }
  }

  function resetToLobby() {
    setStage("lobby")
    setSeq([])
    setCount(0)
    setIndex(0)
    setMyScore(0)
    setOppScore(0)
    setOppDone(false)
    setSelected(null)
    setLastCorrect(null)
  }

  // Inbound socket frames drive the whole duel.
  const handleEvent = useCallback((e: BattleInbound) => {
    switch (e.type) {
      case "battle_start": {
        const next = buildSequence(e.seed, e.count)
        setOpponent(e.opponent)
        setSeq(next)
        setCount(e.count)
        setIndex(0)
        setMyScore(0)
        setOppScore(0)
        setOppDone(false)
        setSelected(null)
        setLastCorrect(null)
        setMessage("")
        startSlider(next[0])
        setStage("question")
        break
      }
      case "opponent_progress":
        setOppScore(e.score)
        break
      case "opponent_finish":
        setOppScore(e.score)
        setOppDone(true)
        break
      case "opponent_left":
        setStage((s) => {
          if (s === "lobby" || s === "summary") return s
          setMessage("Your opponent left the battle.")
          return "lobby"
        })
        break
      case "opponent_unavailable":
        setMessage(`@${e.username ?? "That user"} is not online. Ask them to open the Battle tab.`)
        setStage((s) => (s === "waiting" ? "lobby" : s))
        break
      case "error":
        setMessage(e.detail ?? "Something went wrong.")
        setStage((s) => (s === "waiting" ? "lobby" : s))
        break
      default:
        break
    }
  }, [])

  const { status, challenge, progress, finish } = useBattleSocket(!!user, handleEvent)

  // Debounced user search (mirrors the search screen's Accounts tab).
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const r = await apiFetch(`/api/search/users?${new URLSearchParams({ q })}`)
        setResults(r.ok ? ((await r.json()) as UserResult[]) : [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  // Load the user's following list once so the lobby can show friends ready to
  // battle before any search. Returns the same {username, is_verified,
  // avatar_url} shape the rows expect (is_self is absent, so rows stay tappable).
  useEffect(() => {
    if (!user) {
      setFriends(null)
      return
    }
    let cancelled = false
    setFriendsLoading(true)
    apiFetch(`/api/users/${encodeURIComponent(user.username)}/following`)
      .then(async (r) => (r.ok ? ((await r.json()) as UserResult[]) : []))
      .catch(() => [])
      .then((list) => {
        if (!cancelled) setFriends(list)
      })
      .finally(() => {
        if (!cancelled) setFriendsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  // Both players finished -> reveal the result.
  useEffect(() => {
    if (stage === "done" && oppDone) setStage("summary")
  }, [stage, oppDone])

  function challengeUser(username: string) {
    if (status !== "open") {
      setMessage("Connecting... try again in a moment.")
      return
    }
    setMessage("")
    setOpponent(username)
    if (challenge(username)) setStage("waiting")
  }

  // Shared bookkeeping once an answer is committed (choice or slider).
  function commitAnswer(correct: boolean) {
    const newScore = myScore + (correct ? 1 : 0)
    setMyScore(newScore)
    setLastCorrect(correct)
    progress(index, correct, newScore)
    setStage("feedback")
  }

  function handleSelect(i: number) {
    const cur = seq[index]
    if (stage !== "question" || selected !== null || !cur || cur.kind === "numeric") return
    setSelected(i)
    commitAnswer(i === cur.answerIndex)
  }

  function handleSubmitNumeric() {
    const cur = seq[index]
    if (stage !== "question" || !cur || cur.kind !== "numeric") return
    commitAnswer(sliderValue === cur.answerValue)
  }

  function handleNext() {
    const nextIndex = index + 1
    if (nextIndex >= count) {
      // myScore already includes the answer just revealed.
      finish(myScore)
      setStage("done")
      return
    }
    setIndex(nextIndex)
    setSelected(null)
    setLastCorrect(null)
    startSlider(seq[nextIndex])
    setStage("question")
  }

  function handleRematch() {
    if (!opponent || status !== "open") {
      resetToLobby()
      return
    }
    setMessage("")
    if (challenge(opponent)) setStage("waiting")
    else resetToLobby()
  }

  function handleExit() {
    if (onExit) onExit()
  }

  // --- Render helpers -------------------------------------------------------

  // Per-option pill styling: rest is a frosted white/6% pill; feedback reveals
  // the correct option in good, a wrong pick in bad, the rest dimmed.
  function optionStyle(i: number): React.CSSProperties {
    const cur = seq[index]
    if (stage !== "feedback" || lastCorrect === null || !cur || cur.kind === "numeric") {
      return { borderColor: "transparent", background: "rgb(255 255 255 / 0.06)", color: "var(--color-ink-body)" }
    }
    if (i === cur.answerIndex) {
      return { borderColor: "var(--color-good)", background: "rgb(106 191 132 / 0.10)", color: "var(--color-good)" }
    }
    if (i === selected) {
      return { borderColor: "var(--color-bad)", background: "rgb(192 88 112 / 0.10)", color: "var(--color-bad)" }
    }
    return { borderColor: "var(--color-edge)", background: "rgb(255 255 255 / 0.06)", color: "var(--color-ink-faint)" }
  }

  function renderStrip() {
    return (
      <div className="flex items-center justify-around">
        <ScoreStat label="You" value={myScore} color="var(--color-lamp)" />
        <span className="text-ink-muted text-[13px]">vs</span>
        <ScoreStat label={opponent ? `@${opponent}` : "Rival"} value={oppScore} color="var(--color-ink)" />
      </div>
    )
  }

  function renderAnswerArea() {
    const cur = seq[index]
    if (!cur) return null
    if (cur.kind === "numeric") {
      const answered = stage === "feedback" && lastCorrect !== null
      return (
        <div className="flex flex-col gap-4">
          <NumberSlider
            min={cur.min}
            max={cur.max}
            step={cur.step ?? 1}
            unit={cur.unit}
            value={sliderValue}
            onChange={setSliderValue}
            disabled={answered}
            showResult={answered}
            correct={lastCorrect ?? undefined}
            correctValue={cur.answerValue}
          />
          {stage === "question" && (
            <button className="btn btn-primary w-full py-3" onClick={handleSubmitNumeric}>
              Submit
            </button>
          )}
        </div>
      )
    }
    const interactive = stage === "question"
    return (
      <div className="flex flex-col gap-2.5">
        {cur.options.map((opt, i) => (
          <button
            key={i}
            onClick={interactive ? () => handleSelect(i) : undefined}
            disabled={!interactive || selected !== null}
            className="text-left rounded-3xl border px-5 py-4 text-base transition-colors duration-150 disabled:cursor-default"
            style={optionStyle(i)}
          >
            {opt}
          </button>
        ))}
      </div>
    )
  }

  function renderLoginGate() {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-serif font-medium text-[34px] text-ink">Battle</h1>
        <MessageSlab>
          <p className="text-ink-dim text-[15px]">Log in to search for a friend and battle them 1v1.</p>
          <Link href="/login" className="btn btn-primary px-6 py-2.5">
            Log in
          </Link>
        </MessageSlab>
      </div>
    )
  }

  function renderUserRow(u: UserResult) {
    return (
      <button
        key={u.username}
        onClick={() => !u.is_self && challengeUser(u.username)}
        disabled={u.is_self}
        className={`w-full text-left card px-4 py-3 flex items-center gap-3 transition-colors duration-150 ${
          u.is_self ? "opacity-50 cursor-default" : "cursor-pointer hover:bg-white/[0.07]"
        }`}
      >
        <Avatar username={u.username} avatarUrl={u.avatar_url} size={44} verified={u.is_verified} />
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="text-ink text-sm font-semibold truncate">@{u.username}</span>
          {u.is_verified > 0 && <VerifiedBadge size={14} level={u.is_verified} />}
        </div>
        {u.is_self ? (
          <span className="text-ink-muted text-xs shrink-0">You</span>
        ) : (
          <span className="btn btn-primary shrink-0 px-3.5 py-1.5 text-xs">Battle</span>
        )}
      </button>
    )
  }

  function renderLobby() {
    // With no search typed the lobby shows the friends list; typing switches to
    // live search results. Each branch tracks its own loading and empty state.
    const searchingUsers = query.trim().length > 0
    const list = searchingUsers ? results : friends
    const loadingList = searchingUsers ? searching : friendsLoading
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-serif font-medium text-[34px] text-ink">Battle</h1>
        <p className="text-ink-dim text-[15px] text-center">
          Pick a friend below or search by username, then challenge them to a 1v1.
        </p>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username"
          autoCapitalize="none"
          autoCorrect="off"
          className="field rounded-full text-[15px] px-[18px] py-3"
        />

        {message && (
          <MessageSlab>
            <p className="text-ink-dim text-sm">{message}</p>
          </MessageSlab>
        )}

        {!searchingUsers && <p className={LABEL_CAPS}>Your friends</p>}

        {loadingList ? (
          <div className="flex flex-col gap-2">
            <div className="stage-pulse card h-[68px] w-full" />
            <div className="stage-pulse card h-[68px] w-full" />
          </div>
        ) : list && list.length > 0 ? (
          <div className="flex flex-col gap-2">{list.map(renderUserRow)}</div>
        ) : searchingUsers ? (
          <p className="text-ink-muted text-sm text-center pt-6">No one found for &ldquo;{query}&rdquo;.</p>
        ) : friends !== null ? (
          <p className="text-ink-muted text-sm text-center pt-6">
            You are not following anyone yet. Search by username to find a friend.
          </p>
        ) : null}
      </div>
    )
  }

  function renderWaiting() {
    return (
      <MessageSlab>
        <p className="text-ink text-base font-semibold">Waiting for @{opponent}...</p>
        <p className="text-ink-dim text-sm">They need the Battle tab open to accept.</p>
        <button className="btn btn-ghost px-5 py-2.5" onClick={resetToLobby}>
          Cancel
        </button>
      </MessageSlab>
    )
  }

  function renderQuestion() {
    const cur = seq[index]
    if (!cur) return null
    return (
      <div className="flex flex-col gap-4">
        {renderStrip()}
        <GlowCard>
          <div className="px-6 py-7 flex flex-col gap-4">
            <p className={LABEL_CAPS}>
              Question {index + 1} of {count}
            </p>
            <p className="font-serif text-[22px] leading-[30px] text-ink">{cur.prompt}</p>
          </div>
        </GlowCard>
        {renderAnswerArea()}
      </div>
    )
  }

  function renderFeedback() {
    const cur = seq[index]
    if (!cur || lastCorrect === null) return null
    const good = lastCorrect
    const last = index + 1 >= count
    return (
      <div className="flex flex-col gap-4">
        {renderStrip()}
        <GlowCard>
          <div className="px-6 py-7 flex flex-col gap-3.5">
            <span
              className="text-[11px] tracking-[0.16em] uppercase font-semibold"
              style={{ color: good ? "var(--color-good)" : "var(--color-bad)" }}
            >
              {good ? "Correct" : "Incorrect"}
            </span>
            <p className="font-serif text-[20px] leading-7 text-ink">{cur.prompt}</p>
          </div>
        </GlowCard>
        {renderAnswerArea()}
        {cur.explanation && <p className="text-ink-dim text-sm leading-[21px]">{cur.explanation}</p>}
        <button className="btn btn-primary w-full py-3" onClick={handleNext}>
          {last ? "Finish" : "Next"}
        </button>
      </div>
    )
  }

  function renderDone() {
    return (
      <MessageSlab>
        <p className="text-ink text-base font-semibold">You finished &mdash; {myScore} correct</p>
        <p className="text-ink-dim text-sm">Waiting for @{opponent} to finish...</p>
      </MessageSlab>
    )
  }

  function renderSummary() {
    const won = myScore > oppScore
    const draw = myScore === oppScore
    const title = draw ? "Draw" : won ? "You win" : "You lose"
    const titleColor = draw ? "var(--color-ink)" : won ? "var(--color-good)" : "var(--color-bad)"
    return (
      <div className="flex flex-col gap-5">
        <GlowCard>
          <div className="px-6 py-8 flex flex-col items-center gap-5">
            <span className="font-serif font-medium text-[30px]" style={{ color: titleColor }}>
              {title}
            </span>
            <div className="flex items-center justify-around self-stretch">
              <ScoreStat label="You" value={myScore} color="var(--color-lamp)" />
              <span className="text-ink-muted text-[15px]">vs</span>
              <ScoreStat label={opponent ? `@${opponent}` : "Rival"} value={oppScore} color="var(--color-ink)" />
            </div>
          </div>
        </GlowCard>
        <div className="flex flex-col gap-2.5">
          <button className="btn btn-primary w-full py-3" onClick={handleRematch} disabled={status !== "open"}>
            Rematch
          </button>
          <button className="btn btn-ghost w-full py-3" onClick={handleExit}>
            Back to feed
          </button>
        </div>
      </div>
    )
  }

  let body: React.ReactNode
  if (!user) body = renderLoginGate()
  else if (stage === "lobby") body = renderLobby()
  else if (stage === "waiting") body = renderWaiting()
  else if (stage === "question") body = renderQuestion()
  else if (stage === "feedback") body = renderFeedback()
  else if (stage === "done") body = renderDone()
  else body = renderSummary()

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain [&::-webkit-scrollbar]:hidden [scrollbar-width:none] px-4 pt-20 pb-24">
      {body}
    </div>
  )
}
