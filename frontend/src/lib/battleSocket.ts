"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { TOKEN_KEY, wsUrl } from "@/lib/storage"

// Battle WebSocket hook for web, modeled on chatSocket.ts and the mobile
// battleSocket (mobile/src/lib/battle/battleSocket.ts). Like chat it pairs by
// account: the first frame is {type:"auth", token} (the JWT from localStorage,
// never in the URL), so a duel is between two logged-in users found via the user
// search. The protocol is the 1v1 relay (challenge a username / progress /
// finish), and inbound frames are forwarded to the caller through onEvent. The
// 3s reconnect loop is shared with chat.

export type BattleInbound =
  | { type: "auth_ok"; user_id: number }
  | { type: "battle_start"; battle_id: string; seed: number; count: number; opponent: string }
  | { type: "opponent_progress"; battle_id?: string; index: number; correct: boolean; score: number }
  | { type: "opponent_finish"; battle_id?: string; score: number }
  | { type: "opponent_left"; battle_id?: string }
  | { type: "opponent_unavailable"; username?: string; reason?: "offline" | "busy" }
  | { type: "error"; detail?: string; code?: string }
  | { type: "pong" }

type SocketStatus = "connecting" | "open" | "closed"

// Reconnect backoff (M143/FE-RENDER-040): 1s doubling to a 30s cap instead of
// the old fixed 3s loop. 4401/4403 closes are deterministic rejections, so
// they stop the retry chain; a login/tab change re-keys the effect.
const RETRY_BASE_MS = 1000
const RETRY_MAX_MS = 30000
const CLOSE_UNAUTHORIZED = 4401
const CLOSE_INSECURE = 4403

// Opens one battle socket while `enabled` is true. The caller passes
// loggedIn AND tab-active (M143/FE-RENDER-040/BUG-042): a Battle tab the user
// swiped away from disconnects, so a hidden tab can no longer sit
// challengeable in the background and idle sockets stop retrying forever.
export function useBattleSocket(enabled: boolean, onEvent: (e: BattleInbound) => void) {
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
      // Read the token fresh on every attempt (BUG-050): a rotated token is
      // picked up by the next connect instead of replaying a stale capture.
      const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null
      if (!token) {
        setStatus("closed")
        return
      }
      // The constructor throws synchronously on a malformed URL (e.g. a missing
      // API base). Treat that like a failed connection and schedule a retry, so
      // the throw does not escape the reconnect timer and permanently kill the
      // socket.
      let ws: WebSocket
      try {
        ws = new WebSocket(wsUrl("/api/battle/ws"))
      } catch {
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
          const data = JSON.parse(e.data) as BattleInbound
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
      // Reconnect is driven by onclose; onerror only silences the console warning.
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

  // Challenge a user (by username) to start a duel.
  const challenge = useCallback((username: string): boolean => {
    return sendFrame({ type: "challenge", username })
  }, [])

  // Report one answered question; the server mirrors it to the opponent.
  // battle_id lets the server drop frames from a battle that is already over.
  const progress = useCallback((index: number, correct: boolean, score: number, battleId?: string): boolean => {
    return sendFrame({ type: "progress", index, correct, score, battle_id: battleId })
  }, [])

  // Report the final score once all questions are answered.
  const finish = useCallback((score: number, battleId?: string): boolean => {
    return sendFrame({ type: "finish", score, battle_id: battleId })
  }, [])

  return { status, challenge, progress, finish }
}
