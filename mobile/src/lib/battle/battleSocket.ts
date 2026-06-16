import { useCallback, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"
import { WS_URL } from "../../config"
import { getAuthToken } from "../api"

// Battle WebSocket hook, modeled on ../chatSocket.ts. Like chat it pairs by
// account: the first frame is {type:"auth", token} (the JWT read synchronously
// from the SecureStore-backed cache, never in the URL), so a duel is between two
// logged-in users found via the user search. The protocol is the 1v1 relay
// (challenge a username / progress / finish), and inbound frames are forwarded
// to the caller through an onEvent callback. Shared with chat: the 3s reconnect
// loop and the AppState foreground reconnect (mobile sockets drop when
// backgrounded, so the retry loop alone feels slow).

export type BattleInbound =
  | { type: "auth_ok"; user_id: number }
  | { type: "battle_start"; seed: number; count: number; opponent: string }
  | { type: "opponent_progress"; index: number; correct: boolean; score: number }
  | { type: "opponent_finish"; score: number }
  | { type: "opponent_left" }
  | { type: "opponent_unavailable"; username?: string }
  | { type: "error"; detail?: string }
  | { type: "pong" }

type SocketStatus = "connecting" | "open" | "closed"

// The backend rejects plain ws outside local development, so production
// deployments must serve the API over https (WS_URL then derives wss).
function battleWsUrl(): string {
  return `${WS_URL}/api/battle/ws`
}

// Opens one battle socket for the signed-in user and keeps it alive for the
// lifetime of the calling component. `loggedIn` gates the connection (and
// reconnects it if the user logs in after mount); guests get a closed socket.
export function useBattleSocket(loggedIn: boolean, onEvent: (e: BattleInbound) => void) {
  const [status, setStatus] = useState<SocketStatus>("connecting")
  const wsRef = useRef<WebSocket | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    const token = getAuthToken()
    if (!loggedIn || !token) {
      setStatus("closed")
      return
    }
    let unmounted = false
    let retryTimer: ReturnType<typeof setTimeout>

    function connect() {
      const ws = new WebSocket(battleWsUrl())
      wsRef.current = ws
      setStatus("connecting")
      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }))
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string) as BattleInbound
          if (data.type === "auth_ok") setStatus("open")
          onEventRef.current(data)
        } catch {
          // Ignore malformed frames.
        }
      }
      // Reconnect is driven by onclose; onerror only silences RN's warning.
      ws.onerror = () => {}
      ws.onclose = () => {
        if (unmounted) return
        setStatus("closed")
        retryTimer = setTimeout(connect, 3000)
      }
    }

    // Returning to the foreground: if the socket isn't already live, drop the
    // pending 3s retry and reconnect now.
    function onAppStateChange(next: string) {
      if (next !== "active" || unmounted) return
      const ws = wsRef.current
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
      clearTimeout(retryTimer)
      connect()
    }

    connect()
    const sub = AppState.addEventListener("change", onAppStateChange)
    return () => {
      unmounted = true
      clearTimeout(retryTimer)
      sub.remove()
      wsRef.current?.close()
    }
  }, [loggedIn])

  function sendFrame(frame: object): boolean {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(frame))
    return true
  }

  // Challenge a user (by username) to start a duel.
  const challenge = useCallback((username: string): boolean => {
    return sendFrame({ type: "challenge", username })
  }, [])

  // Report one answered question; the server mirrors it to the opponent.
  const progress = useCallback((index: number, correct: boolean, score: number): boolean => {
    return sendFrame({ type: "progress", index, correct, score })
  }, [])

  // Report the final score once all questions are answered.
  const finish = useCallback((score: number): boolean => {
    return sendFrame({ type: "finish", score })
  }, [])

  return { status, challenge, progress, finish }
}
