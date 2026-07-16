"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/lib/auth"
import {
  useArenaSocket,
  type ArenaInbound,
  type ArenaQueuePlayer,
  type ArenaStanding,
} from "@/lib/arenaSocket"
import { buildSequence } from "@/lib/battle/seededQuestions"
import type { MarathonQuestion } from "@/types/train"
import Avatar from "./Avatar"
import { badgeSrc } from "@/lib/accessories"
import NumberSlider from "./NumberSlider"
import WorldMapPicker from "./WorldMapPicker"
import TrainLeaderboard from "./TrainLeaderboard"
import { haversineKm, scoreLabel } from "@/lib/train/scoring"
import { GlowCard, MessageSlab, LABEL_CAPS } from "./stage"

// The Arena tab: RANKED 1v1v1v1. Four players in a similar knowledge-rating
// range are pulled from a matchmaking queue and race through the same seeded
// question sequence; finishing order moves everyone's rating.
//
// Shares Battle's shape (frosted glow slabs, seeded sequence derived locally
// from the server's seed, live score strip) but differs where "ranked" demands
// it:
//   - No opponent picking: you queue, the server matches you (lib/arenaSocket).
//   - The SERVER grades every answer. We send the player's pick and wait for
//     answer_result; we never compute the score we are rated on. The local
//     question pool is used only to render the prompt and highlight the right
//     answer afterwards.
//   - The summary is a placement table with rating deltas, not a win/lose card.
//
// State machine:
//   lobby -> queueing -> question <-> feedback -> done -> summary
// Edge frames (match over, connection lost) drop back to the lobby with a
// message.

type Stage = "lobby" | "queueing" | "question" | "feedback" | "done" | "summary"

interface Props {
  // Switch back to the feed from the summary's secondary button.
  onExit?: () => void
  // Whether the Arena tab is the visible pager page. The socket only connects
  // while active (as in Battle, M143/FE-RENDER-040/BUG-042): swiping away
  // disconnects, which also drops the player out of the queue rather than
  // matching someone who is not watching the screen.
  active?: boolean
  // Fires true while the waiting room (the queueing stage) is showing, false
  // otherwise. The page uses it to hide the bottom nav dock, which the
  // full-screen waiting room owns instead.
  onWaitingRoomChange?: (inWaitingRoom: boolean) => void
}

// Waiting-room slots. The 2x2 grid assumes a four-player match: if
// ARENA_PLAYERS ever changes server-side, this grid has to change with it.
const ARENA_SLOTS = 4

// Waiting-room tile geometry, all derived from TILE_RATIO so the three numbers
// cannot drift apart. The avatar is half the tile's WIDTH and sits centred in
// the tile's upper half, which the badge artwork is drawn around.
const TILE_RATIO = 1.5 // tile height / tile width
const AVATAR_WIDTH = 0.5 // avatar diameter / tile width
// Centre of the upper half, as a fraction of the tile's width.
const UPPER_HALF_CENTRE = TILE_RATIO / 4
// The avatar's top edge as a percentage of the tile's HEIGHT, because that is
// what CSS `top` resolves against.
const AVATAR_TOP_PCT = ((UPPER_HALF_CENTRE - AVATAR_WIDTH / 2) / TILE_RATIO) * 100

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
  const avatarSize = Math.round(width * AVATAR_WIDTH)
  if (!player) {
    return (
      <div
        className="aspect-[1/1.5] rounded-3xl border border-dashed border-edge flex flex-col items-center justify-center gap-3 stage-pulse"
        style={{ background: "rgb(255 255 255 / 0.02)" }}
      >
        <div className="rounded-full bg-surface-3 border border-edge" style={{ width: 56, height: 56 }} />
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
          flows directly under the avatar and both sit in the tile's upper
          half. Sized in px from the measurement above, so it is skipped on the
          first frame, before the ResizeObserver has reported. */}
      <div
        className="absolute inset-x-0 flex flex-col items-center gap-2 px-3"
        style={{ top: `${AVATAR_TOP_PCT}%` }}
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
          // White over a black shadow so the name holds up against whatever the
          // badge artwork puts behind it, light or dark.
          className="text-base font-bold truncate max-w-full"
          style={{ color: "#ffffff", textShadow: "0 1px 2px rgb(0 0 0 / 0.95), 0 2px 8px rgb(0 0 0 / 0.8)" }}
        >
          {player.username}
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

// One player's live score in the top strip.
function PlayerScore({ name, score, isMe, done, left }: {
  name: string
  score: number
  isMe: boolean
  done: boolean
  left: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0 flex-1">
      <span className={`${LABEL_CAPS} truncate max-w-full ${isMe ? "text-lamp" : ""}`}>
        {isMe ? "You" : `@${name}`}
      </span>
      <span
        className="font-mono text-[22px] leading-none"
        style={{ color: isMe ? "var(--color-lamp)" : "var(--color-ink)", opacity: left ? 0.4 : 1 }}
      >
        {score}
      </span>
      {/* Status under the number so the strip never reflows between states. */}
      <span className="text-[9px] text-ink-muted h-3">{left ? "left" : done ? "done" : ""}</span>
    </div>
  )
}

export default function Arena({ onExit, active = true, onWaitingRoomChange }: Props) {
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
  // the prompts, but the score comes back from the server.
  const [seq, setSeq] = useState<MarathonQuestion[]>([])
  const [count, setCount] = useState(0)
  const [index, setIndex] = useState(0)
  const [names, setNames] = useState<string[]>([])
  const [scores, setScores] = useState<Record<string, number>>({})
  const [done, setDone] = useState<string[]>([])
  const [left, setLeft] = useState<string[]>([])
  const [standings, setStandings] = useState<ArenaStanding[]>([])

  // Per-question answer state. `pending` covers the round trip to the server's
  // grade: the answer is locked in but the verdict has not landed yet.
  const [selected, setSelected] = useState<number | null>(null)
  const [sliderValue, setSliderValue] = useState(0)
  // The dropped pin for a map question, in lat/lng; null until the player taps.
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null)
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)
  // Points the server awarded for the last answer (0..100); partial for numeric
  // and map. Drives the graded feedback.
  const [awarded, setAwarded] = useState<number | null>(null)
  const [pending, setPending] = useState(false)

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

  const resetToLobby = useCallback(() => {
    matchIdRef.current = null
    setStage("lobby")
    setSeq([])
    setCount(0)
    setIndex(0)
    setNames([])
    setScores({})
    setDone([])
    setLeft([])
    setSelected(null)
    setPin(null)
    setLastCorrect(null)
    setAwarded(null)
    setPending(false)
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
        const next = buildSequence(e.seed, e.count)
        matchIdRef.current = e.match_id
        setSeq(next)
        setCount(e.count)
        setIndex(0)
        setNames(e.players.map((p) => p.username))
        setScores(Object.fromEntries(e.players.map((p) => [p.username, 0])))
        setDone([])
        setLeft([])
        setStandings([])
        setSelected(null)
        setPin(null)
        setLastCorrect(null)
        setAwarded(null)
        setPending(false)
        setMessage("")
        setQueuedAt(null)
        setQueuePlayers([])
        startSlider(next[0])
        setStage("question")
        break
      }
      case "answer_result": {
        if (stale(e.match_id)) break
        // The server's verdict is the one that counts; our local pool only
        // decides which option/location to highlight. `awarded` is the graded
        // points (partial for numeric/map); `score` is the running points total.
        setPending(false)
        setLastCorrect(e.correct)
        setAwarded(e.awarded)
        setScores((s) => (user ? { ...s, [user.username]: e.score } : s))
        setStage("feedback")
        break
      }
      case "opponent_progress":
        if (stale(e.match_id)) break
        setScores((s) => ({ ...s, [e.username]: e.score }))
        break
      case "player_finished":
        if (stale(e.match_id)) break
        setScores((s) => ({ ...s, [e.username]: e.score }))
        setDone((d) => (d.includes(e.username) ? d : [...d, e.username]))
        break
      case "player_left":
        if (stale(e.match_id)) break
        setLeft((l) => (l.includes(e.username) ? l : [...l, e.username]))
        break
      case "match_result":
        if (stale(e.match_id)) break
        // Only bank the result here; the effect below decides WHEN to show it.
        // The last player to finish gets match_result while still reading the
        // final question's feedback, and jumping straight to the summary would
        // snatch that feedback away mid-read.
        setStandings(e.standings)
        // The result carries every player's post-match rating; keep ours so the
        // lobby shows the new number without a refetch.
        {
          const mine = e.standings.find((s) => s.is_me)
          if (mine?.rating != null) setRating(mine.rating)
        }
        matchIdRef.current = null
        break
      case "error":
        if (e.code === "stale_match" || e.code === "already_queued") break
        if (
          (e.code === "not_in_match" || e.code === "already_finished") &&
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
        setPending(false)
        setMessage(e.detail ?? "Something went wrong.")
        setStage((s) => (s === "queueing" ? "lobby" : s))
        break
      default:
        break
    }
  }, [user])

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

  // The result is revealed once the player has finished reading their own last
  // feedback (stage "done") AND the server's standings are in -- in either
  // order, which is why this is an effect rather than a jump inside the socket
  // handler (the Battle done/oppDone pattern).
  useEffect(() => {
    if (stage === "done" && standings.length > 0) setStage("summary")
  }, [stage, standings])

  // Tell the page when the waiting room is showing so it can hide the bottom
  // nav dock, which the full-screen waiting room owns. The cleanup restores the
  // dock on any exit, including the Arena unmounting mid-queue.
  const inWaitingRoom = stage === "queueing"
  useEffect(() => {
    onWaitingRoomChange?.(inWaitingRoom)
    return () => onWaitingRoomChange?.(false)
  }, [inWaitingRoom, onWaitingRoomChange])

  // Queue timer, purely informational (the widening rating window lives
  // server-side). Ticks only while queueing, so nothing runs in the lobby.
  useEffect(() => {
    if (stage !== "queueing" || queuedAt === null) return
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - queuedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [stage, queuedAt])

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

  // Send the pick; the verdict arrives as answer_result. `pending` latches so a
  // double activation cannot send two answers for one question (the server
  // would reject the second as a bad index, but the UI should not depend on it).
  function submit(choice: { chosenIndex?: number; chosenValue?: number; chosenLat?: number; chosenLng?: number }) {
    if (pending || stage !== "question" || !matchIdRef.current) return
    setPending(true)
    if (!answer(matchIdRef.current, index, choice)) {
      setPending(false)
      setMessage("Connection lost. The match ended.")
      resetToLobby()
    }
  }

  function handleSelect(i: number) {
    const cur = seq[index]
    if (stage !== "question" || selected !== null || pending || !cur || cur.kind === "numeric") return
    setSelected(i)
    submit({ chosenIndex: i })
  }

  function handleSubmitNumeric() {
    const cur = seq[index]
    if (stage !== "question" || pending || !cur || cur.kind !== "numeric") return
    submit({ chosenValue: sliderValue })
  }

  function handleSubmitMap() {
    const cur = seq[index]
    if (stage !== "question" || pending || !cur || cur.kind !== "map" || !pin) return
    submit({ chosenLat: pin.lat, chosenLng: pin.lng })
  }

  function handleNext() {
    const nextIndex = index + 1
    // Bounded by BOTH the server count and the derived sequence: buildSequence
    // slices to the pool, so a count above the pool would otherwise strand the
    // player on a blank screen (the Battle fix).
    if (nextIndex >= Math.min(count, seq.length)) {
      // The server already knows we finished (it counts our answers); it sends
      // match_result once everyone is done.
      setStage("done")
      return
    }
    setIndex(nextIndex)
    setSelected(null)
    setPin(null)
    setLastCorrect(null)
    setAwarded(null)
    startSlider(seq[nextIndex])
    setStage("question")
  }

  function handleExit() {
    if (onExit) onExit()
  }

  // --- Render helpers -------------------------------------------------------

  // Color is never the only marker of an answered option (A11Y-018): a glyph
  // and a spoken suffix carry the same state.
  function optionState(i: number): "correct" | "incorrect" | null {
    const cur = seq[index]
    if (stage !== "feedback" || lastCorrect === null || !cur || cur.kind === "numeric" || cur.kind === "map") return null
    if (i === cur.answerIndex) return "correct"
    if (i === selected) return "incorrect"
    return null
  }

  const OPTION_GLYPH = { correct: "✓", incorrect: "✗" } as const
  const OPTION_SUFFIX = { correct: ", correct answer", incorrect: ", your choice, incorrect" } as const

  function optionStyle(i: number): React.CSSProperties {
    const cur = seq[index]
    if (stage !== "feedback" || lastCorrect === null || !cur || cur.kind === "numeric" || cur.kind === "map") {
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

  // Me first, then the three rivals in match order.
  function orderedNames(): string[] {
    if (!user) return names
    return [user.username, ...names.filter((n) => n !== user.username)]
  }

  function renderStrip() {
    const ordered = orderedNames()
    return (
      <>
        {/* Opponent scores arrive over the socket with nothing else to signal
            them, so they are announced politely (settled values only). */}
        <div aria-live="polite" className="sr-only">
          {ordered.map((n) => `${n === user?.username ? "You" : "@" + n} ${scores[n] ?? 0}`).join(", ")}
        </div>
        <div aria-hidden="true" className="flex items-start gap-1">
          {ordered.map((n) => (
            <PlayerScore
              key={n}
              name={n}
              score={scores[n] ?? 0}
              isMe={n === user?.username}
              done={done.includes(n)}
              left={left.includes(n)}
            />
          ))}
        </div>
      </>
    )
  }

  function renderAnswerArea() {
    const cur = seq[index]
    if (!cur) return null
    if (cur.kind === "numeric") {
      const answered = stage === "feedback" && awarded !== null
      return (
        <div className="flex flex-col gap-4">
          <NumberSlider
            min={cur.min}
            max={cur.max}
            step={cur.step ?? 1}
            unit={cur.unit}
            value={sliderValue}
            onChange={setSliderValue}
            disabled={answered || pending}
            showResult={answered}
            // Graded: a near miss still reads as a good result (green) above the
            // 50-point tier, not a hard red like an exact-only match would.
            correct={answered && awarded !== null ? scoreLabel(awarded).good : undefined}
            correctValue={cur.answerValue}
          />
          {stage === "question" && (
            <button className="btn btn-primary w-full py-3" onClick={handleSubmitNumeric} disabled={pending}>
              {pending ? "Checking..." : "Submit"}
            </button>
          )}
        </div>
      )
    }
    if (cur.kind === "map") {
      const answered = stage === "feedback" && awarded !== null
      return (
        <div className="flex flex-col gap-4">
          <WorldMapPicker
            value={pin}
            onChange={setPin}
            disabled={pending || answered}
            showResult={answered}
            answer={{ lat: cur.answerLat, lng: cur.answerLng }}
            answerLabel={cur.answerLabel}
          />
          {stage === "question" && (
            <button className="btn btn-primary w-full py-3" onClick={handleSubmitMap} disabled={pending || !pin}>
              {pending ? "Checking..." : pin ? "Submit pin" : "Tap the map to place a pin"}
            </button>
          )}
        </div>
      )
    }
    const interactive = stage === "question" && !pending
    return (
      <div className="flex flex-col gap-2.5">
        {cur.options.map((opt, i) => (
          <button
            key={i}
            onClick={interactive ? () => handleSelect(i) : undefined}
            disabled={!interactive || selected !== null}
            aria-label={optionState(i) ? `${opt}${OPTION_SUFFIX[optionState(i)!]}` : undefined}
            className="text-left rounded-3xl border px-5 py-4 text-base transition-colors duration-150 disabled:cursor-default"
            style={{ ...optionStyle(i), opacity: pending && selected !== i ? 0.6 : 1 }}
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
            <p className={LABEL_CAPS}>Ranked · 1v1v1v1</p>
            <p className="font-serif text-[22px] leading-[30px] text-ink">
              Four players, seven questions, one winner.
            </p>
            <p className="text-ink-dim text-sm leading-[21px]">
              You are matched with three players near your rating. Every answer is scored on the
              server, and where you finish moves your knowledge rating.
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
              <p className={LABEL_CAPS}>Ranked · 1v1v1v1</p>
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
    if (!cur || awarded === null) return null
    // Graded questions (numeric/map) show the points earned and a tier; choice
    // stays a plain Correct/Incorrect.
    const graded = cur.kind === "numeric" || cur.kind === "map"
    const good = graded ? scoreLabel(awarded).good : !!lastCorrect
    const headline = graded ? `${awarded} / 100 · ${scoreLabel(awarded).label}` : lastCorrect ? "Correct" : "Incorrect"
    const distanceKm =
      cur.kind === "map" && pin ? Math.round(haversineKm(pin.lat, pin.lng, cur.answerLat, cur.answerLng)) : null
    const mapLabel = cur.kind === "map" ? cur.answerLabel : undefined
    const last = index + 1 >= Math.min(count, seq.length)
    return (
      <div className="flex flex-col gap-4">
        {renderStrip()}
        <GlowCard>
          <div className="px-6 py-7 flex flex-col gap-3.5">
            <span
              className="text-[11px] tracking-[0.16em] uppercase font-semibold"
              style={{ color: good ? "var(--color-good)" : "var(--color-bad)" }}
            >
              {headline}
            </span>
            <p className="font-serif text-[20px] leading-7 text-ink">{cur.prompt}</p>
            {distanceKm !== null && (
              <p className="text-ink-dim text-sm">
                {distanceKm.toLocaleString()} km from {mapLabel ?? "the target"}.
              </p>
            )}
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
    const outstanding = names.filter((n) => n !== user?.username && !done.includes(n) && !left.includes(n))
    return (
      <div className="flex flex-col gap-4">
        {renderStrip()}
        <MessageSlab>
          <p className="text-ink text-base font-semibold">
            You finished &mdash; {(user && scores[user.username]) ?? 0} points
          </p>
          <p className="text-ink-dim text-sm">
            {outstanding.length > 0
              ? `Waiting for ${outstanding.map((n) => "@" + n).join(", ")}...`
              : "Working out the results..."}
          </p>
          {/* Results are scored server-side and arrive on their own; there is
              deliberately no exit here that would forfeit a finished run. */}
        </MessageSlab>
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
                    {s.left && <span className="text-ink-muted text-xs"> · left</span>}
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

  let body: React.ReactNode
  if (!user) body = renderLoginGate()
  else if (stage === "lobby") body = renderLobby()
  else if (stage === "queueing") body = renderQueueing()
  else if (stage === "question") body = renderQuestion()
  else if (stage === "feedback") body = renderFeedback()
  else if (stage === "done") body = renderDone()
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
