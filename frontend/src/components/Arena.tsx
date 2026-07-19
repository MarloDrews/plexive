"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/lib/auth"
import {
  useArenaSocket,
  type ArenaInbound,
  type ArenaPlayer,
  type ArenaQueuePlayer,
  type ArenaRoundResult,
  type ArenaStanding,
} from "@/lib/arenaSocket"
import { buildSequence } from "@/lib/battle/seededQuestions"
import type { MarathonQuestion } from "@/types/train"
import Avatar from "./Avatar"
import VerifiedBadge from "./VerifiedBadge"
import { badgeSrc } from "@/lib/accessories"
import {
  BADGE_TILE,
  BADGE_AVATAR_TOP_PCT,
  BADGE_NAME_LINE_HEIGHT,
  BADGE_NAME_SHADOW,
} from "./ProfileBadgeCard"
import NumberSlider from "./NumberSlider"
import WorldMapPicker from "./WorldMapPicker"
import TrainLeaderboard from "./TrainLeaderboard"
import { haversineKm, scoreLabel } from "@/lib/train/scoring"
import { GlowCard, MessageSlab, LABEL_CAPS } from "./stage"

// The Arena tab: RANKED 1v1v1v1. Four players in a similar knowledge-rating
// range are pulled from a matchmaking queue and play the same seeded question
// sequence in LOCKSTEP; finishing score moves everyone's rating.
//
// Lockstep, server-driven (routers/arena.py): the whole room sits on one shared
// question. The server opens a round (round_start, with a per-question shot
// clock), everyone answers within the limit (answer_ack confirms ours,
// player_answered lifts each badge), then the correct answer is revealed to the
// room at once (round_reveal) and the match advances together. Nobody races
// ahead, and nobody learns whether they were right before the shared reveal.
//
// Differences from Battle it keeps:
//   - No opponent picking: you queue, the server matches you (lib/arenaSocket).
//   - The SERVER grades every answer. We send the player's pick and never a
//     score; the local question pool only renders the prompt and, at the
//     reveal, highlights the right answer.
//   - The summary is a placement table with rating deltas.
//
// State machine:
//   lobby -> queueing -> question <-> reveal -> ... -> summary
// The server drives question<->reveal; match_result ends on summary. Edge
// frames (match over, connection lost) drop back to the lobby with a message.

type Stage = "lobby" | "queueing" | "question" | "reveal" | "summary"

interface Props {
  // Switch back to the feed from the summary's secondary button.
  onExit?: () => void
  // Whether the Arena tab is the visible pager page. The socket only connects
  // while active (as in Battle, M143/FE-RENDER-040/BUG-042): swiping away
  // disconnects, which also drops the player out of the queue rather than
  // matching (or stranding in a match) someone who is not watching the screen.
  active?: boolean
  // Fires true while the Arena owns the bottom of the viewport -- the
  // full-screen waiting room AND a live match (whose badge strip sits where the
  // dock would). The page uses it to hide the bottom nav dock.
  onOwnsBottomChange?: (ownsBottom: boolean) => void
}

// Waiting-room slots. The 2x2 grid assumes a four-player match: if
// ARENA_PLAYERS ever changes server-side, this grid has to change with it.
const ARENA_SLOTS = 4

// Waiting-room tile geometry comes from the shared badge-tile standard
// (ProfileBadgeCard's BADGE_TILE): every size is a fraction of the tile width,
// so a fluid waiting-room tile is a proportional scale of the fixed profile
// card. The avatar is half the width and sits centred in the tile's upper half,
// which the badge artwork is drawn around.

// The tile is a fluid grid cell, so half its width is only knowable at render
// time -- and Avatar sizes its picture in px, because the image optimiser needs
// a number. Hence the measurement. clientWidth is the padding box: the same box
// the badge art and the avatar are positioned against.
function useTileWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

// One waiting-room tile: a joined player, or an empty seat still being filled.
// Portrait 1:1.5 so four tiles read as a lobby rather than a row of chips.
function QueueTile({ player, isMe }: { player: ArenaQueuePlayer | null; isMe: boolean }) {
  const [ref, width] = useTileWidth()
  const avatarSize = Math.round(width * BADGE_TILE.avatar)
  const nameSize = Math.round(width * BADGE_TILE.name)
  if (!player) {
    return (
      <div
        ref={ref}
        className="aspect-[1/1.5] rounded-3xl border border-dashed border-edge flex flex-col items-center justify-center gap-3 stage-pulse"
        style={{ background: "rgb(255 255 255 / 0.02)" }}
      >
        {/* Placeholder disc matches the filled tiles' avatar footprint (a 56px
            fallback until the ResizeObserver reports) so seats stay uniform. */}
        <div
          className="rounded-full bg-surface-3 border border-edge"
          style={{ width: avatarSize || 56, height: avatarSize || 56 }}
        />
        <span className={LABEL_CAPS}>Waiting</span>
      </div>
    )
  }
  // An equipped badge supplies the tile's own artwork, so the flat fill would
  // only wash it out. Your own seat is marked by the isMe fill and by seat
  // order (queueSlots puts you first); the outline and the name are uniform.
  const badge = badgeSrc(player.badge_id)
  return (
    <div
      ref={ref}
      className="relative aspect-[1/1.5] rounded-3xl border-2 overflow-hidden"
      style={{
        borderColor: "var(--color-ink-muted)",
        background: badge
          ? undefined
          : isMe ? "rgb(124 111 255 / 0.10)" : "rgb(255 255 255 / 0.04)",
      }}
    >
      {badge && (
        // Decorative backdrop behind the avatar and name. The art is authored
        // 1:1.5 -- the tile's own ratio -- so object-cover crops nothing.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={badge}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      )}
      {/* Anchored to the avatar's top edge rather than centred, so the name
          flows directly under the avatar and both sit in the tile's upper half.
          Gap, padding and name size are fractions of the measured width (the
          BADGE_TILE standard), so this fluid tile is a proportional scale of the
          fixed profile card. Sizes are skipped on the first frame, before the
          ResizeObserver has reported. */}
      <div
        className="absolute inset-x-0 flex flex-col items-center"
        style={{
          top: `${BADGE_AVATAR_TOP_PCT}%`,
          gap: width * BADGE_TILE.gap,
          paddingLeft: width * BADGE_TILE.padX,
          paddingRight: width * BADGE_TILE.padX,
        }}
      >
        {avatarSize > 0 && (
          <Avatar
            username={player.username}
            avatarUrl={player.avatar_url}
            frameId={player.avatar_frame_id}
            size={avatarSize}
          />
        )}
        <span
          className="flex items-center gap-1 font-bold max-w-full"
          style={{
            color: "#ffffff",
            fontSize: nameSize,
            lineHeight: BADGE_NAME_LINE_HEIGHT,
            textShadow: BADGE_NAME_SHADOW,
          }}
        >
          <span className="truncate">{player.username}</span>
          {player.is_verified > 0 && (
            <VerifiedBadge size={Math.round(width * BADGE_TILE.verified)} level={player.is_verified} />
          )}
        </span>
      </div>
    </div>
  )
}

// One player's badge in the bottom strip during a live match. Whoever has
// answered the current round is lifted and fully opaque; whoever still owes an
// answer sits lower and at 50%; a player who left is dimmed further. The equipped
// badge art is the backdrop (the "badge with profile picture" the tile is named
// for), with a scrim so the name and score stay legible over it.
function PlayerBadge({ player, score, isMe, hasAnswered, hasLeft }: {
  player: ArenaPlayer
  score: number
  isMe: boolean
  hasAnswered: boolean
  hasLeft: boolean
}) {
  const badge = badgeSrc(player.badge_id)
  const lifted = hasAnswered && !hasLeft
  return (
    <div
      className="relative flex-1 min-w-0 rounded-2xl border overflow-hidden transition-all duration-300 ease-out"
      style={{
        transform: lifted ? "translateY(-10px)" : "translateY(0)",
        opacity: hasLeft ? 0.3 : hasAnswered ? 1 : 0.5,
        borderColor: isMe ? "var(--color-lamp)" : "var(--color-edge)",
        background: badge ? undefined : isMe ? "rgb(124 111 255 / 0.10)" : "rgb(255 255 255 / 0.04)",
      }}
    >
      {badge && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={badge}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      )}
      {/* Legibility scrim over busy badge art. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.05))" }}
      />
      <div className="relative flex flex-col items-center gap-1 px-1.5 pt-2.5 pb-2">
        <Avatar
          username={player.username}
          avatarUrl={player.avatar_url}
          frameId={player.avatar_frame_id}
          size={40}
        />
        <span className="flex items-center gap-0.5 max-w-full">
          <span
            className="truncate text-[11px] font-semibold"
            style={{ color: "#ffffff", textShadow: BADGE_NAME_SHADOW }}
          >
            {isMe ? "You" : player.username}
          </span>
          {player.is_verified > 0 && <VerifiedBadge size={11} level={player.is_verified} />}
        </span>
        <span
          className="font-mono text-[15px] leading-none"
          style={{ color: "#ffffff", textShadow: BADGE_NAME_SHADOW }}
        >
          {score}
        </span>
        <span
          className="text-[9px] h-3 leading-3"
          style={{ color: hasLeft ? "var(--color-ink-muted)" : hasAnswered ? "var(--color-good)" : "var(--color-ink-muted)" }}
        >
          {hasLeft ? "left" : hasAnswered ? "ready" : "..."}
        </span>
      </div>
    </div>
  )
}

// Ordinal for a placement (1 -> 1st). Placements here are always 1..4.
const ORDINALS = ["", "1st", "2nd", "3rd", "4th"] as const
function ordinal(placement: number): string {
  return ORDINALS[placement] ?? `${placement}th`
}

export default function Arena({ onExit, active = true, onOwnsBottomChange }: Props) {
  const { user } = useAuth()

  const [stage, setStage] = useState<Stage>("lobby")
  const [message, setMessage] = useState("")
  // Render-mirrored refs so the stable socket handler reads current state
  // without impure state updaters (the Battle pattern).
  const stageRef = useRef<Stage>("lobby")
  stageRef.current = stage
  const matchIdRef = useRef<string | null>(null)

  // Queue state. `queuePlayers` is the waiting-room roster: the server re-sends
  // it whole on every join/leave, so it is replaced, never merged.
  const [rating, setRating] = useState<number | null>(null)
  const [waiting, setWaiting] = useState(0)
  const [queuePlayers, setQueuePlayers] = useState<ArenaQueuePlayer[]>([])
  const [queuedAt, setQueuedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  // Match state. `seq` is derived locally from the server's seed; it renders
  // the prompts, but the score and the round timing come from the server.
  const [seq, setSeq] = useState<MarathonQuestion[]>([])
  const [count, setCount] = useState(0)
  const [index, setIndex] = useState(0)
  const [players, setPlayers] = useState<ArenaPlayer[]>([])
  const [scores, setScores] = useState<Record<string, number>>({})
  // Usernames that have answered the CURRENT round (drives the badge lift).
  const [answered, setAnswered] = useState<string[]>([])
  const [left, setLeft] = useState<string[]>([])
  const [standings, setStandings] = useState<ArenaStanding[]>([])

  // Per-round answer state. `submitted` locks input once we have answered this
  // round; the verdict is withheld until the shared reveal.
  const [selected, setSelected] = useState<number | null>(null)
  const [sliderValue, setSliderValue] = useState(0)
  // The dropped pin for a map question, in lat/lng; null until the player taps.
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null)
  const [submitted, setSubmitted] = useState(false)
  // Our own result for the revealed round: awarded points and full-marks flag;
  // null while a question is open.
  const [myReveal, setMyReveal] = useState<{ awarded: number; correct: boolean } | null>(null)

  // Round shot clock. `roundEndsAt` is a wall-clock deadline (ms); `secondsLeft`
  // is the derived countdown the interval below updates. The server is
  // authoritative -- this is a visual guide that locks input when it hits zero.
  const [roundEndsAt, setRoundEndsAt] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  // Numeric questions start the slider at a random step, never on the correct
  // answer (an unmoved submit would be a free correct) -- as in Battle.
  function startSlider(q: MarathonQuestion | undefined) {
    if (q && q.kind === "numeric") {
      const step = q.step ?? 1
      const steps = Math.floor((q.max - q.min) / step)
      let rand = q.min + Math.round(Math.random() * steps) * step
      if (rand === q.answerValue) {
        rand = rand + step <= q.max ? rand + step : rand - step
      }
      setSliderValue(Math.min(q.max, Math.max(q.min, rand)))
    }
  }

  // Reset the per-round input state for a freshly opened question.
  function resetRound(q: MarathonQuestion | undefined) {
    setSelected(null)
    setPin(null)
    setSubmitted(false)
    setMyReveal(null)
    setAnswered([])
    startSlider(q)
  }

  const resetToLobby = useCallback(() => {
    matchIdRef.current = null
    setStage("lobby")
    setSeq([])
    setCount(0)
    setIndex(0)
    setPlayers([])
    setScores({})
    setAnswered([])
    setLeft([])
    setSelected(null)
    setPin(null)
    setSubmitted(false)
    setMyReveal(null)
    setRoundEndsAt(null)
    setSecondsLeft(0)
    setQueuedAt(null)
    setQueuePlayers([])
    setWaiting(0)
  }, [])

  const handleEvent = useCallback((e: ArenaInbound) => {
    // Frames stamped with a match we are not in are stale (a match that
    // already ended) and are dropped, as in Battle (BUG-010/BUG-087).
    const stale = (matchId?: string) => matchId !== undefined && matchId !== matchIdRef.current
    switch (e.type) {
      case "queued":
        setRating(e.rating)
        setWaiting(e.waiting)
        setQueuedAt(Date.now())
        setElapsed(0)
        setMessage("")
        setStage("queueing")
        break
      case "queue_update":
        // Arrives for every waiting player on any join/leave, including our own
        // queue frame, so the roster is authoritative -- take it wholesale.
        setWaiting(e.waiting)
        setQueuePlayers(e.players)
        break
      case "queue_cancelled":
        setQueuedAt(null)
        setQueuePlayers([])
        setStage((s) => (s === "queueing" ? "lobby" : s))
        break
      case "match_start": {
        // Set the room up; the first round_start (which the driver sends
        // immediately after) opens question 0 and starts its clock.
        const next = buildSequence(e.seed, e.count)
        matchIdRef.current = e.match_id
        setSeq(next)
        setCount(e.count)
        setIndex(0)
        setPlayers(e.players)
        setScores(Object.fromEntries(e.players.map((p) => [p.username, 0])))
        setStandings([])
        setLeft([])
        resetRound(next[0])
        setRoundEndsAt(null)
        setSecondsLeft(0)
        setMessage("")
        setQueuedAt(null)
        setQueuePlayers([])
        setStage("question")
        break
      }
      case "round_start": {
        if (stale(e.match_id)) break
        setIndex(e.index)
        resetRound(seq[e.index])
        setRoundEndsAt(Date.now() + e.seconds * 1000)
        setSecondsLeft(e.seconds)
        setStage("question")
        break
      }
      case "answer_ack":
        if (stale(e.match_id)) break
        // We already locked in optimistically on submit; this just confirms it.
        setSubmitted(true)
        break
      case "player_answered":
        if (stale(e.match_id) || e.index !== index) break
        setAnswered((a) => (a.includes(e.username) ? a : [...a, e.username]))
        break
      case "round_reveal": {
        if (stale(e.match_id)) break
        // The round is resolved: reveal correctness and the updated scores for
        // everyone. Scores are the server's running totals (authoritative).
        setScores((s) => {
          const next = { ...s }
          for (const r of e.results) next[r.username] = r.score
          return next
        })
        setAnswered(e.results.map((r) => r.username))
        const mine = e.results.find((r: ArenaRoundResult) => r.username === user?.username)
        if (mine) setMyReveal({ awarded: mine.awarded, correct: mine.correct })
        setRoundEndsAt(null)
        setStage("reveal")
        break
      }
      case "player_left":
        if (stale(e.match_id)) break
        setLeft((l) => (l.includes(e.username) ? l : [...l, e.username]))
        break
      case "match_result":
        if (stale(e.match_id)) break
        setStandings(e.standings)
        {
          const mine = e.standings.find((s) => s.is_me)
          if (mine?.rating != null) setRating(mine.rating)
        }
        matchIdRef.current = null
        setStage("summary")
        break
      case "error":
        // A closed/duplicate round is not worth a red banner: the client is
        // already waiting for the reveal, so swallow these quietly.
        if (
          e.code === "stale_match" ||
          e.code === "already_queued" ||
          e.code === "bad_index" ||
          e.code === "already_answered"
        ) {
          break
        }
        if (
          e.code === "not_in_match" &&
          stageRef.current !== "lobby" &&
          stageRef.current !== "summary"
        ) {
          // The server has no match for us: stop stranding the player on a
          // dead screen (the Battle BUG-011 lesson).
          matchIdRef.current = null
          setMessage("The match ended.")
          setStage("lobby")
          break
        }
        setMessage(e.detail ?? "Something went wrong.")
        setStage((s) => (s === "queueing" ? "lobby" : s))
        break
      default:
        break
    }
  }, [index, seq, user])

  const { status, queue, cancel, answer, forceStart } = useArenaSocket(!!user && active, handleEvent)

  // A closed socket mid-match means the server tore the room down (or the user
  // swiped away, which disconnects): drop to the lobby rather than playing on
  // against nobody.
  useEffect(() => {
    if (status === "closed" && stage !== "lobby" && stage !== "summary") {
      matchIdRef.current = null
      setMessage(stage === "queueing" ? "Connection lost. Left the queue." : "Connection lost. The match ended.")
      resetToLobby()
    }
  }, [status, stage, resetToLobby])

  // Tell the page when the Arena owns the bottom of the viewport (waiting room
  // or a live match), so it hides the bottom nav dock. The cleanup restores the
  // dock on any exit, including the Arena unmounting mid-match.
  const ownsBottom = stage === "queueing" || stage === "question" || stage === "reveal"
  useEffect(() => {
    onOwnsBottomChange?.(ownsBottom)
    return () => onOwnsBottomChange?.(false)
  }, [ownsBottom, onOwnsBottomChange])

  // Queue timer, purely informational (the widening rating window lives
  // server-side). Ticks only while queueing, so nothing runs in the lobby.
  useEffect(() => {
    if (stage !== "queueing" || queuedAt === null) return
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - queuedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [stage, queuedAt])

  // Round countdown. Derives the displayed seconds from the server's deadline;
  // the server closes the round for real, so a small clock skew only affects
  // the number shown. Runs only while a question is open.
  useEffect(() => {
    if (stage !== "question" || roundEndsAt === null) return
    // round_start already seeded secondsLeft, so the interval only has to keep
    // it ticking down (setting state inside the interval callback, not the
    // effect body -- matching the queue timer above).
    const timer = setInterval(
      () => setSecondsLeft(Math.max(0, Math.ceil((roundEndsAt - Date.now()) / 1000))),
      250,
    )
    return () => clearInterval(timer)
  }, [stage, roundEndsAt])

  function handleFind() {
    if (status !== "open") {
      setMessage("Connecting... try again in a moment.")
      return
    }
    setMessage("")
    if (!queue()) setMessage("Could not reach the queue. Try again.")
  }

  function handleCancel() {
    cancel()
    setQueuedAt(null)
    setQueuePlayers([])
    setStage("lobby")
  }

  // TEMP (testing only, remove before launch): start a match now with whoever
  // is already in the waiting room, even fewer than four players. The server
  // replies with match_start, which drives the normal question stage.
  function handleForceStart() {
    if (status !== "open") {
      setMessage("Connecting... try again in a moment.")
      return
    }
    if (!forceStart()) setMessage("Could not start the match. Try again.")
  }

  // Whether the player may still act on the open question: it must be open, we
  // must not have answered yet, and the shot clock must not have run out.
  const canAnswer = stage === "question" && !submitted && secondsLeft > 0

  // Send the pick and lock the round optimistically (the badge lifts at once);
  // answer_ack confirms it. A failed send means the socket is gone.
  function submit(choice: { chosenIndex?: number; chosenValue?: number; chosenLat?: number; chosenLng?: number }) {
    if (!canAnswer || !matchIdRef.current) return
    setSubmitted(true)
    if (user) setAnswered((a) => (a.includes(user.username) ? a : [...a, user.username]))
    if (!answer(matchIdRef.current, index, choice)) {
      setMessage("Connection lost. The match ended.")
      resetToLobby()
    }
  }

  function handleSelect(i: number) {
    const cur = seq[index]
    if (!canAnswer || selected !== null || !cur || cur.kind === "numeric" || cur.kind === "map") return
    setSelected(i)
    submit({ chosenIndex: i })
  }

  function handleSubmitNumeric() {
    const cur = seq[index]
    if (!canAnswer || !cur || cur.kind !== "numeric") return
    submit({ chosenValue: sliderValue })
  }

  function handleSubmitMap() {
    const cur = seq[index]
    if (!canAnswer || !cur || cur.kind !== "map" || !pin) return
    submit({ chosenLat: pin.lat, chosenLng: pin.lng })
  }

  function handleExit() {
    if (onExit) onExit()
  }

  // --- Render helpers -------------------------------------------------------

  const revealing = stage === "reveal"

  // Color is never the only marker of an answered option (A11Y-018): a glyph
  // and a spoken suffix carry the same state.
  function optionState(i: number): "correct" | "incorrect" | null {
    const cur = seq[index]
    if (!revealing || !cur || cur.kind === "numeric" || cur.kind === "map") return null
    if (i === cur.answerIndex) return "correct"
    if (i === selected) return "incorrect"
    return null
  }

  const OPTION_GLYPH = { correct: "✓", incorrect: "✗" } as const
  const OPTION_SUFFIX = { correct: ", correct answer", incorrect: ", your choice, incorrect" } as const

  function optionStyle(i: number): React.CSSProperties {
    const cur = seq[index]
    if (!revealing || !cur || cur.kind === "numeric" || cur.kind === "map") {
      return { borderColor: "transparent", background: "rgb(255 255 255 / 0.06)", color: "var(--color-ink-body)" }
    }
    if (i === cur.answerIndex) {
      return { borderColor: "var(--color-good)", background: "rgb(106 191 132 / 0.10)", color: "var(--color-good)" }
    }
    if (i === selected) {
      return { borderColor: "var(--color-bad)", background: "color-mix(in srgb, var(--color-bad) 10%, transparent)", color: "var(--color-bad)" }
    }
    return { borderColor: "var(--color-edge)", background: "rgb(255 255 255 / 0.06)", color: "var(--color-ink-muted)" }
  }

  function renderAnswerArea() {
    const cur = seq[index]
    if (!cur) return null
    if (cur.kind === "numeric") {
      return (
        <div className="flex flex-col gap-4">
          <NumberSlider
            min={cur.min}
            max={cur.max}
            step={cur.step ?? 1}
            unit={cur.unit}
            value={sliderValue}
            onChange={setSliderValue}
            disabled={!canAnswer}
            showResult={revealing}
            // Graded: a near miss still reads as a good result (green) above the
            // 50-point tier, not a hard red like an exact-only match would.
            correct={revealing && myReveal ? scoreLabel(myReveal.awarded).good : undefined}
            correctValue={cur.answerValue}
          />
          {stage === "question" && (
            <button className="btn btn-primary w-full py-3" onClick={handleSubmitNumeric} disabled={!canAnswer}>
              {submitted ? "Locked in" : secondsLeft === 0 ? "Time's up" : "Submit"}
            </button>
          )}
        </div>
      )
    }
    if (cur.kind === "map") {
      return (
        <div className="flex flex-col gap-4">
          <WorldMapPicker
            value={pin}
            onChange={setPin}
            disabled={!canAnswer}
            showResult={revealing}
            answer={{ lat: cur.answerLat, lng: cur.answerLng }}
            answerLabel={cur.answerLabel}
          />
          {stage === "question" && (
            <button className="btn btn-primary w-full py-3" onClick={handleSubmitMap} disabled={!canAnswer || !pin}>
              {submitted ? "Locked in" : secondsLeft === 0 ? "Time's up" : pin ? "Submit pin" : "Tap the map to place a pin"}
            </button>
          )}
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-2.5">
        {cur.options.map((opt, i) => (
          <button
            key={i}
            onClick={canAnswer ? () => handleSelect(i) : undefined}
            disabled={!canAnswer || selected !== null}
            aria-label={optionState(i) ? `${opt}${OPTION_SUFFIX[optionState(i)!]}` : undefined}
            className="text-left rounded-3xl border px-5 py-4 text-base transition-colors duration-150 disabled:cursor-default"
            style={{ ...optionStyle(i), opacity: submitted && selected !== i && !revealing ? 0.6 : 1 }}
          >
            {opt}
            {optionState(i) && <span aria-hidden="true" className="ml-2">{OPTION_GLYPH[optionState(i)!]}</span>}
          </button>
        ))}
      </div>
    )
  }

  function renderLoginGate() {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-serif font-medium text-[34px] text-ink">Arena</h1>
        <MessageSlab>
          <p className="text-ink-dim text-[15px]">
            Log in to play ranked matches against three other players and climb the leaderboard.
          </p>
          <Link href="/login" className="btn btn-primary px-6 py-2.5">
            Log in
          </Link>
        </MessageSlab>
      </div>
    )
  }

  function renderLobby() {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif font-medium text-[34px] text-ink">Arena</h1>
          <div className="flex flex-col items-center gap-0.5 rounded-2xl bg-lamp/10 px-4 py-2">
            <span className={LABEL_CAPS}>Rating</span>
            <span className="font-mono text-[18px] text-lamp leading-none">{rating ?? "--"}</span>
          </div>
        </div>

        {message && (
          <MessageSlab>
            <p className="text-ink-dim text-sm">{message}</p>
          </MessageSlab>
        )}

        <GlowCard>
          <div className="px-6 py-7 flex flex-col items-center gap-4 text-center">
            <p className={LABEL_CAPS}>Ranked &middot; 1v1v1v1</p>
            <p className="font-serif text-[22px] leading-[30px] text-ink">
              Four players, seven questions, one winner.
            </p>
            <p className="text-ink-dim text-sm leading-[21px]">
              You are matched with three players near your rating. Everyone answers each question
              together against the clock, and where you finish moves your knowledge rating.
            </p>
            <button
              className="btn btn-primary w-full py-3"
              onClick={handleFind}
              disabled={status !== "open"}
            >
              {status === "open" ? "Find match" : "Connecting..."}
            </button>
          </div>
        </GlowCard>

        <TrainLeaderboard />
      </div>
    )
  }

  // Me first, then whoever else is waiting, then empty seats. My own tile falls
  // back to the auth profile so it fills the moment I queue, without waiting for
  // the roster broadcast to come back.
  function queueSlots(): (ArenaQueuePlayer | null)[] {
    const mine: ArenaQueuePlayer[] = user
      ? [{
          username: user.username,
          avatar_url: user.avatar_url,
          avatar_frame_id: user.avatar_frame_id,
          badge_id: user.badge_id,
          is_verified: user.is_verified,
        }]
      : []
    const others = queuePlayers.filter((p) => p.username !== user?.username)
    const filled = [...mine, ...others].slice(0, ARENA_SLOTS)
    const empty = Array<ArenaQueuePlayer | null>(ARENA_SLOTS - filled.length).fill(null)
    return [...filled, ...empty]
  }

  function renderQueueing() {
    const slots = queueSlots()
    // `waiting` counts the whole queue, which can exceed the four the grid
    // seats: a deep queue that is not pairing means the ratings are too far
    // apart, so say how many are waiting rather than claim a full lobby.
    const overflowing = waiting > ARENA_SLOTS
    const joined = slots.filter((p) => p !== null).length
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif font-medium text-[34px] text-ink">Waiting room</h1>
          <div className="flex flex-col items-center gap-0.5 rounded-2xl bg-lamp/10 px-4 py-2">
            <span className={LABEL_CAPS}>Elapsed</span>
            <span className="font-mono text-[18px] text-lamp leading-none">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
            </span>
          </div>
        </div>

        <GlowCard>
          <div className="px-5 py-6 flex flex-col gap-5">
            <div className="flex flex-col items-center gap-1.5 text-center">
              <p className={LABEL_CAPS}>Ranked &middot; 1v1v1v1</p>
              <p className="font-serif text-[20px] leading-7 text-ink">
                {overflowing
                  ? `${waiting} players waiting`
                  : `${joined} of ${ARENA_SLOTS} players ready`}
              </p>
              <p className="text-ink-dim text-sm leading-[21px]">
                Looking for players near {rating ?? "your"} rating.
              </p>
            </div>

            {/* The roster arrives over the socket with nothing else to signal a
                join, so it is announced politely (settled values only). */}
            <div aria-live="polite" className="sr-only">
              {slots
                .map((p, i) =>
                  p === null
                    ? `Seat ${i + 1} open`
                    : p.username === user?.username
                      ? "You joined"
                      : `@${p.username} joined`,
                )
                .join(", ")}
            </div>
            <div aria-hidden="true" className="grid grid-cols-2 gap-2.5">
              {slots.map((p, i) => (
                <QueueTile key={p ? p.username : `seat-${i}`} player={p} isMe={p?.username === user?.username} />
              ))}
            </div>

            {/* The server widens the rating window the longer you wait; say so,
                because a long wait otherwise looks broken. */}
            <p className="text-ink-muted text-xs text-center">
              {elapsed < 60
                ? "The rating range widens the longer you wait."
                : "Searching the whole rating range."}
            </p>
          </div>
        </GlowCard>

        {/* TEMP (testing only, remove before launch): start the match now with
            however many players (1-4) are currently in the waiting room. */}
        <button
          className="btn btn-quiet w-full"
          onClick={handleForceStart}
          disabled={status !== "open"}
        >
          Start now ({joined} {joined === 1 ? "player" : "players"}) &middot; test
        </button>

        <button className="btn btn-ghost w-full py-3" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    )
  }

  // The question card, shared by the open (question) and revealed (reveal)
  // stages: the same prompt, answer area and countdown, coloured once revealed.
  function renderPlay() {
    const cur = seq[index]
    if (!cur) return null
    const graded = cur.kind === "numeric" || cur.kind === "map"
    const good = graded ? (myReveal ? scoreLabel(myReveal.awarded).good : false) : !!myReveal?.correct
    const headline =
      revealing && myReveal
        ? graded
          ? `${myReveal.awarded} / 100 · ${scoreLabel(myReveal.awarded).label}`
          : myReveal.correct
            ? "Correct"
            : "Incorrect"
        : null
    const distanceKm =
      revealing && cur.kind === "map" && pin
        ? Math.round(haversineKm(pin.lat, pin.lng, cur.answerLat, cur.answerLng))
        : null
    // Narrowed here so the union stays typed where distanceKm is rendered.
    const mapLabel = cur.kind === "map" ? cur.answerLabel : undefined
    const answeredCount = answered.length
    // Countdown turns urgent under 6s; hidden once revealing.
    const urgent = secondsLeft <= 5
    return (
      <div className="flex flex-col gap-4">
        <GlowCard>
          <div className="px-6 py-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <p className={LABEL_CAPS}>
                Question {index + 1} of {count}
              </p>
              {!revealing && (
                <span
                  aria-hidden="true"
                  className="font-mono text-[15px] leading-none rounded-full px-2.5 py-1"
                  style={{
                    color: urgent ? "var(--color-bad)" : "var(--color-ink)",
                    background: urgent ? "color-mix(in srgb, var(--color-bad) 12%, transparent)" : "rgb(255 255 255 / 0.06)",
                  }}
                >
                  0:{String(secondsLeft).padStart(2, "0")}
                </span>
              )}
              {revealing && headline && (
                <span
                  className="text-[11px] tracking-[0.14em] uppercase font-semibold"
                  style={{ color: good ? "var(--color-good)" : "var(--color-bad)" }}
                >
                  {headline}
                </span>
              )}
            </div>
            <p className="font-serif text-[22px] leading-[30px] text-ink">{cur.prompt}</p>
            {distanceKm !== null && (
              <p className="text-ink-dim text-sm">
                {distanceKm.toLocaleString()} km from {mapLabel ?? "the target"}.
              </p>
            )}
          </div>
        </GlowCard>

        {renderAnswerArea()}

        {revealing && cur.explanation && (
          <p className="text-ink-dim text-sm leading-[21px]">{cur.explanation}</p>
        )}

        {/* Status line so a player who has answered (or run out of time) knows
            what they are waiting for. */}
        {stage === "question" && (submitted || secondsLeft === 0) && (
          <p className="text-ink-muted text-sm text-center" aria-live="polite">
            {answeredCount >= players.length
              ? "Revealing..."
              : `Waiting for the others... (${answeredCount}/${players.length})`}
          </p>
        )}
        {revealing && (
          <p className="text-ink-muted text-xs text-center">Next question in a moment...</p>
        )}
      </div>
    )
  }

  // The bottom strip of participant badges, pinned below the question.
  function renderBadgeStrip() {
    const answeredCount = answered.length
    return (
      <div className="shrink-0 px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
        {/* Announce answer progress politely; the badges themselves are
            decorative to a screen reader. */}
        <div aria-live="polite" className="sr-only">
          {stage === "reveal" ? "Round revealed." : `${answeredCount} of ${players.length} answered.`}
        </div>
        <div aria-hidden="true" className="flex items-end gap-2">
          {players.map((p) => (
            <PlayerBadge
              key={p.username}
              player={p}
              score={scores[p.username] ?? 0}
              isMe={p.username === user?.username}
              hasAnswered={stage === "reveal" || answered.includes(p.username)}
              hasLeft={left.includes(p.username)}
            />
          ))}
        </div>
      </div>
    )
  }

  function renderSummary() {
    const mine = standings.find((s) => s.is_me)
    const place = mine ? ordinal(mine.placement) : ""
    const won = mine?.placement === 1
    return (
      <div className="flex flex-col gap-5">
        <GlowCard>
          <div className="px-6 py-8 flex flex-col items-center gap-5">
            <span
              className="font-serif font-medium text-[30px]"
              style={{ color: won ? "var(--color-good)" : "var(--color-ink)" }}
            >
              {won ? "You win" : `${place} place`}
            </span>
            {mine?.delta != null && (
              <div className="flex flex-col items-center gap-1">
                <span
                  className="font-mono text-[26px] leading-none"
                  style={{ color: mine.delta >= 0 ? "var(--color-good)" : "var(--color-bad)" }}
                >
                  {mine.delta >= 0 ? "+" : ""}{mine.delta}
                </span>
                <span className={LABEL_CAPS}>Rating {mine.rating}</span>
              </div>
            )}
            <div className="self-stretch flex flex-col gap-1.5">
              {standings.map((s) => (
                <div
                  key={s.username}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                  style={{ background: s.is_me ? "rgb(124 111 255 / 0.10)" : "rgb(255 255 255 / 0.04)" }}
                >
                  <span className="font-mono text-[13px] text-ink-muted w-7 shrink-0">
                    {ordinal(s.placement)}
                  </span>
                  <span
                    className="flex-1 min-w-0 truncate text-sm"
                    style={{ color: s.is_me ? "var(--color-lamp)" : "var(--color-ink)" }}
                  >
                    {s.is_me ? "You" : `@${s.username}`}
                    {s.left && <span className="text-ink-muted text-xs"> &middot; left</span>}
                  </span>
                  <span className="font-mono text-sm text-ink shrink-0">{s.score}</span>
                  {s.delta != null && (
                    <span
                      className="font-mono text-xs w-10 text-right shrink-0"
                      style={{ color: s.delta >= 0 ? "var(--color-good)" : "var(--color-bad)" }}
                    >
                      {s.delta >= 0 ? "+" : ""}{s.delta}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </GlowCard>
        <div className="flex flex-col gap-2.5">
          <button className="btn btn-primary w-full py-3" onClick={handleFind} disabled={status !== "open"}>
            Play again
          </button>
          <button className="btn btn-ghost w-full py-3" onClick={handleExit}>
            Back to feed
          </button>
        </div>
      </div>
    )
  }

  // A live match (question or reveal) owns the whole viewport: the play area
  // scrolls above a pinned strip of participant badges.
  if (user && (stage === "question" || stage === "reveal")) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-y-auto overscroll-y-contain px-4 pt-20 pb-4">
          {message && (
            <div className="mb-4">
              <MessageSlab>
                <p className="text-ink-dim text-sm">{message}</p>
              </MessageSlab>
            </div>
          )}
          {renderPlay()}
        </div>
        {renderBadgeStrip()}
      </div>
    )
  }

  let body: React.ReactNode
  if (!user) body = renderLoginGate()
  else if (stage === "lobby") body = renderLobby()
  else if (stage === "queueing") body = renderQueueing()
  else body = renderSummary()

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain px-4 pt-20 pb-24">
      {/* The lobby renders `message` itself; every other stage shows it here so
          server errors are never invisible mid-match (the Battle BUG-011 fix). */}
      {message && stage !== "lobby" && !!user && (
        <div className="mb-4">
          <MessageSlab>
            <p className="text-ink-dim text-sm">{message}</p>
          </MessageSlab>
        </div>
      )}
      {body}
    </div>
  )
}
