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

// Opens one authenticated socket for the lifetime of the calling component.
// Auth is a first frame ({type:"auth", token}) so the JWT never appears in a URL.
export function useChatSocket(onMessage: (m: ChatMessage) => void) {
  const [status, setStatus] = useState<SocketStatus>("connecting")
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setStatus("closed")
      return
    }
    let unmounted = false
    let retryTimer: ReturnType<typeof setTimeout>

    function connect() {
      const ws = new WebSocket(wsUrl("/api/chat/ws"))
      wsRef.current = ws
      setStatus("connecting")
      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }))
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === "auth_ok") setStatus("open")
          else if (data.type === "message") onMessageRef.current(data.message as ChatMessage)
          else if (data.type === "error") setError(data.detail ?? "Something went wrong.")
        } catch {
          // Ignore malformed frames.
        }
      }
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
