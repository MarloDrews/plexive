"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { TOKEN_KEY, wsUrl } from "@/lib/storage"

// Arena WebSocket hook, modeled on battleSocket.ts (same JWT-first handshake,
// same backoff, same auth_ok send gate). The protocol differs in two ways that
// matter:
//
//  - Pairing is a QUEUE, not a challenge: send `queue` and wait for the
//    matchmaker to assemble four players in a similar rating range.
//  - Answers are GRADED SERVER-SIDE. We send what the player picked, never a
//    `correct` or `score` of our own, and the server replies with
//    answer_result. Arena moves the knowledge rating, so a client-asserted
//    score would be a free rating (this is the M120/SEC-007 rule the Train
//    marathon already follows; Battle's client-computed `correct` is only
//    acceptable because that duel is unrated).

export type ArenaPlayer = { username: string; rating: number }

// One tile in the waiting room. The server re-sends the whole roster whenever
// queue membership changes, so this is a snapshot, never a delta to apply.
// The two accessory ids are cosmetic (lib/accessories): null, or an id with no
// design, renders the default tile.
export type ArenaQueuePlayer = {
  username: string
  avatar_url: string | null
  avatar_frame_id: number | null
  badge_id: number | null
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
  // `awarded` is the graded points this question earned (0..100); numeric and
  // map answers can score partial credit, so `score` is a running points total.
  | { type: "answer_result"; match_id: string; index: number; correct: boolean; awarded: number; score: number }
  | { type: "opponent_progress"; match_id: string; username: string; index: number; score: number }
  | { type: "player_finished"; match_id: string; username: string; score: number }
  | { type: "player_left"; match_id: string; username: string }
  | { type: "match_result"; match_id: string; standings: ArenaStanding[] }
  | { type: "error"; detail?: string; code?: string }
  | { type: "pong" }

type SocketStatus = "connecting" | "open" | "closed"

const RETRY_BASE_MS = 1000
const RETRY_MAX_MS = 30000
const CLOSE_UNAUTHORIZED = 4401
const CLOSE_INSECURE = 4403

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
    let attempts = 0

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
          }
          onEventRef.current(data)
        } catch {
          // Ignore malformed frames.
        }
      }
      ws.onerror = () => {}
      ws.onclose = (e) => {
        authedRef.current = false
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
