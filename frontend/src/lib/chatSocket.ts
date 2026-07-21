"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { TOKEN_KEY, wsUrl } from "@/lib/storage"

export interface ChatMessage {
  id: number
  conversation_id: number
  sender_id: number
  sender_username: string | null
  body: string
  created_at: string | null
}

export interface ChatParticipant {
  username: string
  avatar_url: string | null
  avatar_frame_id: number | null
  is_verified: number
}

export interface Conversation {
  id: number
  is_group: boolean
  name: string
  participants: ChatParticipant[]
  last_message: ChatMessage | null
  created_at: string | null
}

export const MESSAGE_MAX_CHARS = 2000

type SocketStatus = "connecting" | "open" | "closed"

// Reconnect backoff (M143/BUG-050): 1s doubling to a 30s cap instead of the
// old fixed 3s loop that hammered a downed backend forever. Reset on a
// successful auth. The 4401/4403 close codes are deterministic rejections
// (dead token / insecure transport), so retrying with the same inputs can
// never succeed; stop and wait for the auth state to change instead.
const RETRY_BASE_MS = 1000
const RETRY_MAX_MS = 30000
const CLOSE_UNAUTHORIZED = 4401
const CLOSE_INSECURE = 4403

// Keepalive, same reasoning as arenaSocket.ts: an idle conversation exchanges
// no frames, and a TLS-terminating proxy in front of the backend closes a
// socket that has been silent for around 100 seconds. The server answers
// `pong` (backend/app/routers/chat.py); the dispatch below ignores it.
const HEARTBEAT_MS = 45000

// Opens one authenticated socket while `loggedIn` is true. Auth is a first
// frame ({type:"auth", token}) so the JWT never appears in a URL. Keyed on
// the auth state (M143/BUG-050): logging in connects, logging out closes the
// old socket instead of leaving it authenticated as the previous user, and
// the token is read fresh on every (re)connect attempt.
export function useChatSocket(loggedIn: boolean, onMessage: (m: ChatMessage) => void) {
  const [status, setStatus] = useState<SocketStatus>("connecting")
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const authedRef = useRef(false)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!loggedIn) {
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
      // Read the token inside connect() so a rotated token is picked up by
      // the next attempt instead of replaying a stale capture forever.
      const token = localStorage.getItem(TOKEN_KEY)
      if (!token) {
        setStatus("closed")
        return
      }
      stopHeartbeat()
      // The constructor throws synchronously on a malformed URL (e.g. a missing
      // API base). Treat that like a failed connection and schedule a retry, so
      // the throw does not escape the reconnect timer and permanently kill the
      // socket.
      let ws: WebSocket
      try {
        ws = new WebSocket(wsUrl("/api/chat/ws"))
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
          const data = JSON.parse(e.data)
          if (data.type === "auth_ok") {
            attempts = 0
            authedRef.current = true
            setStatus("open")
            heartbeat = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }))
            }, HEARTBEAT_MS)
          } else if (data.type === "message") onMessageRef.current(data.message as ChatMessage)
          else if (data.type === "error") setError(data.detail ?? "Something went wrong.")
        } catch {
          // Ignore malformed frames.
        }
      }
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
  }, [loggedIn])

  const send = useCallback((conversationId: number, body: string): boolean => {
    const ws = wsRef.current
    // Gate on the server's auth_ok, not just readyState (BUG-093): between
    // onopen and auth_ok a send would report success and then be dropped.
    if (!authedRef.current || !ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify({ type: "send", conversation_id: conversationId, body }))
    return true
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return { status, error, send, clearError }
}
