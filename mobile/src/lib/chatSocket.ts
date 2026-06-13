import { useCallback, useEffect, useRef, useState } from "react"
import { AppState } from "react-native"
import { WS_URL } from "../config"
import { getAuthToken } from "./api"

// Port of frontend/src/app/lib/chatSocket.ts. Same types and protocol; the
// React Native differences are: the token is read synchronously from the
// SecureStore-backed cache (getAuthToken) instead of localStorage, the socket
// URL comes from config.ts (WS_URL, never hardcoded), and an AppState listener
// reconnects immediately when the app returns to the foreground (mobile
// sockets drop when backgrounded, so the 3s retry loop alone would feel slow).

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

// The backend rejects plain ws outside local development, so production
// deployments must serve the API over https (WS_URL then derives wss).
function chatWsUrl(): string {
  return `${WS_URL}/api/chat/ws`
}

// Opens one authenticated socket for the lifetime of the calling component.
// Auth is a first frame ({type:"auth", token}) so the JWT never appears in a URL.
export function useChatSocket(onMessage: (m: ChatMessage) => void) {
  const [status, setStatus] = useState<SocketStatus>("connecting")
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      setStatus("closed")
      return
    }
    let unmounted = false
    let retryTimer: ReturnType<typeof setTimeout>

    function connect() {
      const ws = new WebSocket(chatWsUrl())
      wsRef.current = ws
      setStatus("connecting")
      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }))
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string)
          if (data.type === "auth_ok") setStatus("open")
          else if (data.type === "message") onMessageRef.current(data.message as ChatMessage)
          else if (data.type === "error") setError(data.detail ?? "Something went wrong.")
        } catch {
          // Ignore malformed frames.
        }
      }
      // Reconnect is driven by onclose; onerror only silences RN's warning
      // (a failed connection fires onerror then onclose).
      ws.onerror = () => {}
      ws.onclose = () => {
        if (unmounted) return
        setStatus("closed")
        retryTimer = setTimeout(connect, 3000)
      }
    }

    // Returning to the foreground: if the socket isn't already live, drop the
    // pending 3s retry and reconnect now so messages resume immediately.
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
  }, [])

  const send = useCallback((conversationId: number, body: string): boolean => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify({ type: "send", conversation_id: conversationId, body }))
    return true
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return { status, error, send, clearError }
}
