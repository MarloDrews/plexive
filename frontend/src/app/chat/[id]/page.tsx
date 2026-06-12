"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import Avatar from "@/components/Avatar"
import { apiFetch } from "@/app/lib/api"
import { useAuth } from "@/app/lib/auth"
import {
  MESSAGE_MAX_CHARS,
  useChatSocket,
  type ChatMessage,
  type Conversation,
} from "@/app/lib/chatSocket"

export default function ConversationPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const conversationId = Number(params.id)
  const { user, loading: authLoading } = useAuth()

  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [draft, setDraft] = useState("")
  const [notFound, setNotFound] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const onSocketMessage = useCallback(
    (m: ChatMessage) => {
      if (m.conversation_id !== conversationId) return
      setMessages((prev) => {
        if (prev === null) return prev
        if (prev.some((existing) => existing.id === m.id)) return prev
        return [...prev, m]
      })
    },
    [conversationId]
  )
  const { status, error, send, clearError } = useChatSocket(onSocketMessage)

  useEffect(() => {
    if (authLoading || !user || !Number.isFinite(conversationId)) return
    apiFetch(`/api/chat/conversations/${conversationId}/messages`).then(async (r) => {
      if (!r.ok) {
        setNotFound(true)
        return
      }
      setMessages(await r.json())
    })
    // There is no single-conversation endpoint; the list is small, find the entry.
    apiFetch("/api/chat/conversations").then(async (r) => {
      if (!r.ok) return
      const list: Conversation[] = await r.json()
      setConversation(list.find((c) => c.id === conversationId) ?? null)
    })
  }, [authLoading, user, conversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant", block: "end" })
  }, [messages?.length])

  function handleSend() {
    const body = draft.trim()
    if (!body || body.length > MESSAGE_MAX_CHARS) return
    if (send(conversationId, body)) {
      setDraft("")
      clearError()
    }
  }

  if (!authLoading && !user) {
    return (
      <div className="h-[100dvh] bg-surface-0 flex items-center justify-center px-6">
        <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-3">
          <p className="font-serif text-ink font-medium text-lg">Log in to see your messages</p>
          <Link href="/login" className="btn btn-primary px-5 py-2">
            Log in
          </Link>
        </div>
      </div>
    )
  }

  const headerAvatarUser = conversation && !conversation.is_group
    ? conversation.participants.find((p) => p.username !== user?.username)
    : null

  return (
    <div className="h-[100dvh] bg-surface-0 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] flex flex-col">

        {/* Header — quiet chrome row, no hairline */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            onClick={() => router.push("/chat")}
            className="btn-icon shrink-0"
            aria-label="Back to chats"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          {headerAvatarUser && (
            <Avatar username={headerAvatarUser.username} avatarUrl={headerAvatarUser.avatar_url} size={32} verified={headerAvatarUser.is_verified} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-ink text-sm font-semibold truncate">{conversation?.name ?? "Chat"}</p>
            {conversation?.is_group && (
              <p className="text-ink-faint text-xs truncate">
                {conversation.participants.map((p) => `@${p.username}`).join(", ")}
              </p>
            )}
          </div>
          {status !== "open" && (
            <span className="text-ink-faint text-xs shrink-0">
              {status === "connecting" ? "connecting…" : "offline"}
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1.5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {notFound ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-ink-muted text-sm">Conversation not found.</p>
            </div>
          ) : messages === null ? (
            // Loading: pulsing bubbles where the history will appear.
            <div className="flex-1 flex flex-col justify-end gap-2 pb-2">
              <div className="stage-pulse self-start w-48 h-10 rounded-2xl bg-white/[0.04]" />
              <div className="stage-pulse self-end w-40 h-10 rounded-2xl bg-white/[0.04]" />
              <div className="stage-pulse self-start w-32 h-10 rounded-2xl bg-white/[0.04]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-ink-muted text-sm">Say hello</p>
            </div>
          ) : (
            messages.map((m, i) => {
              const own = m.sender_username === user?.username
              const showSender =
                !own &&
                conversation?.is_group &&
                (i === 0 || messages[i - 1].sender_username !== m.sender_username)
              return (
                <div key={m.id} className={`flex flex-col ${own ? "items-end" : "items-start"}`}>
                  {showSender && (
                    <p className="text-ink-muted text-xs px-2 pt-1">@{m.sender_username}</p>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                      own ? "bg-white/[0.14] text-ink" : "bg-surface-2 text-ink-body"
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input — borderless bar, safe-area aware */}
        <div
          className="px-3 py-2"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
        >
          {error && <p className="text-bad text-xs pb-1.5">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Message…"
              rows={1}
              maxLength={MESSAGE_MAX_CHARS}
              className="field flex-1 text-sm py-2.5 resize-none max-h-32"
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim() || status !== "open" || notFound}
              className={`btn-icon shrink-0${draft.trim() && status === "open" && !notFound ? " btn-icon-active" : ""}`}
              aria-label="Send message"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
