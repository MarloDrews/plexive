"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { TOKEN_KEY, wsUrl } from "@/lib/storage"

// Arena WebSocket hook, modeled on battleSocket.ts (same JWT-first handshake,
// same backoff, same auth_ok send gate). The protocol differs from Battle in
// ways that matter:
//
//  - Pairing is a QUEUE, not a challenge: send `queue` and wait for the
//    matchmaker to assemble four players in a similar rating range.
//  - Answers are GRADED SERVER-SIDE. We send what the player picked, never a
//    `correct` or `score` of our own. Arena moves the knowledge rating, so a
//    client-asserted score would be a free rating (this is the M120/SEC-007
//    rule the Train marathon already follows; Battle's client-computed
//    `correct` is only acceptable because that duel is unrated).
//  - The match plays in LOCKSTEP, server-driven. The server owns the shared
//    question: it opens a round (round_start, with a per-question shot clock),
//    collects everyone's answer (answer_ack confirms ours, player_answered
//    lifts each badge), then reveals the result to the whole room at once
//    (round_reveal) and advances. The client never advances the question
//    itself; it renders what the driver sends.

// One player in a match. match_start carries each player's cosmetics too, so
// the badge tiles can render without a second lookup.
export type ArenaPlayer = {
  username: string
  rating: number
  avatar_url: string | null
  avatar_frame_id: number | null
  badge_id: number | null
  is_verified: number
}

// One row in a round_reveal: what a player scored this round (awarded), their
// running total (score), and whether they got full marks (correct).
export type ArenaRoundResult = {
  username: string
  awarded: number
  score: number
  correct: boolean
}

// One tile in the waiting room. The server re-sends the whole roster whenever
// queue membership changes, so this is a snapshot, never a delta to apply.
// The two accessory ids are cosmetic (lib/accessories): null, or an id with no
// design, renders the default tile.
export type ArenaQueuePlayer = {
  username: string
  avatar_url: string | null
  avatar_frame_id: number | null
  badge_id: number | null
  // Verification level (0 = none); drives the tile's verified badge.
  is_verified: number
}

export type ArenaStanding = {
  username: string
  score: number
  placement: number
  left: boolean
  rating: number | null
  delta: number | null
  is_me: boolean
}

export type ArenaInbound =
  | { type: "auth_ok"; user_id: number }
  | { type: "queued"; rating: number; needed: number; waiting: number }
  | { type: "queue_update"; waiting: number; players: ArenaQueuePlayer[] }
  | { type: "queue_cancelled" }
  | { type: "match_start"; match_id: string; seed: number; count: number; players: ArenaPlayer[] }
  // The room advances to question `index`; `seconds` is its shot clock. The
  // server drives this, not the client.
  | { type: "round_start"; match_id: string; index: number; seconds: number }
  // Our own answer for `index` is locked in. No verdict: correctness is held
  // until the whole-room reveal.
  | { type: "answer_ack"; match_id: string; index: number }
  // Some player answered the current round -- lift their badge. No score (that
  // would spoil the pending reveal).
  | { type: "player_answered"; match_id: string; index: number; username: string }
  // The round is over (all answered or the shot clock fired): reveal correctness
  // and the updated scores for everyone at once. `awarded` is the graded points
  // this question earned (0..100); numeric/map can be partial, so `score` is a
  // running points total. `seconds` is how long this reveal stays on screen
  // before the room advances (0 on the final round, which finalizes straight
  // into the summary) -- the client counts it down as a progress bar.
  | { type: "round_reveal"; match_id: string; index: number; seconds: number; results: ArenaRoundResult[] }
  | { type: "player_left"; match_id: string; username: string }
  | { type: "match_result"; match_id: string; standings: ArenaStanding[] }
  | { type: "error"; detail?: string; code?: string }
  | { type: "pong" }

type SocketStatus = "connecting" | "open" | "closed"

const RETRY_BASE_MS = 1000
const RETRY_MAX_MS = 30000
const CLOSE_UNAUTHORIZED = 4401
const CLOSE_INSECURE = 4403

// Keepalive. A player waiting alone in the queue exchanges no frames until the
// roster changes, and a TLS-terminating proxy in front of the backend closes a
// socket that has been silent for around 100 seconds. Waiting for a real
// opponent is exactly that case, so the client pings well inside that window;
// the server answers `pong` (backend/app/routers/arena.py).
const HEARTBEAT_MS = 45000

// Opens one arena socket while `enabled` is true (logged in AND tab active,
// like Battle): a tab the user swiped away from disconnects, which also drops
// them out of the matchmaking queue rather than matching someone who is not
// looking at the screen.
export function useArenaSocket(enabled: boolean, onEvent: (e: ArenaInbound) => void) {
  const [status, setStatus] = useState<SocketStatus>("connecting")
  const wsRef = useRef<WebSocket | null>(null)
  const authedRef = useRef(false)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!enabled) {
      setStatus("closed")
      return
    }
    let unmounted = false
    let retryTimer: ReturnType<typeof setTimeout>
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let attempts = 0

    // Cleared on close, on reconnect and on unmount, so a retry never leaves a
    // second interval running against a dead socket.
    function stopHeartbeat() {
      clearInterval(heartbeat)
      heartbeat = undefined
    }

    function scheduleRetry() {
      const delay = Math.min(RETRY_BASE_MS * 2 ** attempts, RETRY_MAX_MS)
      attempts += 1
      retryTimer = setTimeout(connect, delay)
    }

    function connect() {
      // Read the token fresh per attempt (BUG-050): a rotated token is picked
      // up by the next connect instead of replaying a stale capture.
      const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null
      if (!token) {
        setStatus("closed")
        return
      }
      stopHeartbeat()
      let ws: WebSocket
      try {
        ws = new WebSocket(wsUrl("/api/arena/ws"))
      } catch {
        // A malformed URL (missing API base) throws synchronously; treat it as
        // a failed connection so the throw cannot escape the retry timer.
        if (unmounted) return
        setStatus("closed")
        scheduleRetry()
        return
      }
      wsRef.current = ws
      authedRef.current = false
      setStatus("connecting")
      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }))
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as ArenaInbound
          if (data.type === "auth_ok") {
            attempts = 0
            authedRef.current = true
            setStatus("open")
            heartbeat = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }))
            }, HEARTBEAT_MS)
          }
          // Keepalive replies carry no state; consumers never see them.
          if (data.type === "pong") return
          onEventRef.current(data)
        } catch {
          // Ignore malformed frames.
        }
      }
      ws.onerror = () => {}
      ws.onclose = (e) => {
        authedRef.current = false
        stopHeartbeat()
        if (unmounted) return
        setStatus("closed")
        if (e.code === CLOSE_UNAUTHORIZED || e.code === CLOSE_INSECURE) return
        scheduleRetry()
      }
    }

    connect()
    return () => {
      unmounted = true
      clearTimeout(retryTimer)
      stopHeartbeat()
      authedRef.current = false
      wsRef.current?.close()
    }
  }, [enabled])

  function sendFrame(frame: object): boolean {
    const ws = wsRef.current
    // Gate on auth_ok, not just readyState (BUG-093): between onopen and
    // auth_ok a send would report success and then be dropped server-side.
    if (!authedRef.current || !ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(frame))
    return true
  }

  // Join the matchmaking queue.
  const queue = useCallback((): boolean => sendFrame({ type: "queue" }), [])

  // Leave the queue.
  const cancel = useCallback((): boolean => sendFrame({ type: "cancel" }), [])

  // TEMP (testing only, remove before launch): start a match now with whoever
  // is already in the waiting room, even fewer than four players.
  const forceStart = useCallback((): boolean => sendFrame({ type: "force_start" }), [])

  // Submit what the player picked for question `index`. Exactly one shape is
  // set, per question kind -- chosenIndex (choice), chosenValue (numeric), or
  // chosenLat+chosenLng (map pin); the server grades it.
  const answer = useCallback(
    (
      matchId: string,
      index: number,
      choice: { chosenIndex?: number; chosenValue?: number; chosenLat?: number; chosenLng?: number },
    ): boolean =>
      sendFrame({
        type: "answer",
        match_id: matchId,
        index,
        chosen_index: choice.chosenIndex,
        chosen_value: choice.chosenValue,
        chosen_lat: choice.chosenLat,
        chosen_lng: choice.chosenLng,
      }),
    [],
  )

  return { status, queue, cancel, answer, forceStart }
}
