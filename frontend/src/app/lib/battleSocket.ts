"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL

// Battle WebSocket hook for web, modeled on chatSocket.ts and the mobile
// battleSocket (mobile/src/lib/battle/battleSocket.ts). Like chat it pairs by
// account: the first frame is {type:"auth", token} (the JWT from localStorage,
// never in the URL), so a duel is between two logged-in users found via the user
// search. The protocol is the 1v1 relay (challenge a username / progress /
// finish), and inbound frames are forwarded to the caller through onEvent. The
// 3s reconnect loop is shared with chat.

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

// http -> ws, https -> wss. The backend rejects plain ws outside local dev,
// so production deployments must serve the API over https.
function battleWsUrl(): string {
  return (API_URL ?? "").replace(/^http/, "ws") + "/api/battle/ws"
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
    const token = typeof window !== "undefined" ? localStorage.getItem("deepscroll_token") : null
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
          const data = JSON.parse(e.data) as BattleInbound
          if (data.type === "auth_ok") setStatus("open")
          onEventRef.current(data)
        } catch {
          // Ignore malformed frames.
        }
      }
      // Reconnect is driven by onclose; onerror only silences the console warning.
      ws.onerror = () => {}
      ws.onclose = () => {
        if (unmounted) return
        setStatus("closed")
        retryTimer = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      unmounted = true
      clearTimeout(retryTimer)
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
