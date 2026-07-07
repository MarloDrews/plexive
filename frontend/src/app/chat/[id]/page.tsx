"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import useSWR from "swr"
import Avatar from "@/components/Avatar"
import { apiFetch } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import {
  MESSAGE_MAX_CHARS,
  useChatSocket,
  type ChatMessage,
  type Conversation,
} from "@/lib/chatSocket"

// Matches the backend GET messages default limit; a full page means more
// history may exist, a short page means we have reached the start.
const MESSAGE_PAGE = 50

// Memoized bubble list: it re-renders only when the messages array (or the
// group/user identity) changes, not on socket-status flips or other page
// state. The DOM stays bounded by the before_id pagination (50 per page,
// older pages load only on an explicit scroll to the top), so no separate
// windowing layer is needed.
const MessageList = memo(function MessageList({
  messages,
  currentUsername,
  isGroup,
}: {
  messages: ChatMessage[]
  currentUsername: string | undefined
  isGroup: boolean
}) {
  return (
    <>
      {messages.map((m, i) => {
        const own = m.sender_username === currentUsername
        const showSender =
          !own &&
          isGroup &&
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
      })}
    </>
  )
})

// The composer owns the draft, so typing re-renders this bar alone instead of
// the page and every message bubble with it.
function Composer({
  canSend,
  error,
  onSend,
}: {
  canSend: boolean
  error: string | null
  onSend: (body: string) => boolean
}) {
  const [draft, setDraft] = useState("")

  function handleSend() {
    const body = draft.trim()
    if (!body || body.length > MESSAGE_MAX_CHARS) return
    if (onSend(body)) setDraft("")
  }

  return (
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
          disabled={!draft.trim() || !canSend}
          className={`btn-icon shrink-0${draft.trim() && canSend ? " btn-icon-active" : ""}`}
          aria-label="Send message"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default function ConversationPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const conversationId = Number(params.id)
  const { user, loading: authLoading } = useAuth()

  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  // Reuse the conversation list the /chat page already cached under this key
  // (revalidates in the background) instead of refetching the whole list just
  // to render one header. There is no single-conversation endpoint.
  const { data: convList } = useSWR<Conversation[]>(
    !authLoading && user ? "/api/chat/conversations" : null
  )
  const conversation = convList?.find((c) => c.id === conversationId) ?? null
  const [notFound, setNotFound] = useState(false)
  // Distinct from notFound: a transient failure (offline, 500) is retryable and
  // must not tell a real participant the conversation does not exist.
  const [loadError, setLoadError] = useState(false)
  // Older-history pagination: hasMore stays true until a page comes back short.
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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

  const loadInitial = useCallback(async () => {
    setNotFound(false)
    setLoadError(false)
    setMessages(null)
    try {
      const r = await apiFetch(`/api/chat/conversations/${conversationId}/messages`)
      // Only a real 404 is "not found"; any other non-ok (401/500) is a
      // retryable error, not a missing conversation.
      if (r.status === 404) {
        setNotFound(true)
        return
      }
      if (!r.ok) {
        setLoadError(true)
        return
      }
      const page: ChatMessage[] = await r.json()
      setMessages(page)
      // A short first page means there is no older history to page back to.
      setHasMore(page.length >= MESSAGE_PAGE)
    } catch {
      // Network failure (offline, dropped connection): retryable, never eternal
      // skeleton or an unhandled rejection.
      setLoadError(true)
    }
  }, [conversationId])

  useEffect(() => {
    if (authLoading || !user) return
    // A non-numeric route id (/chat/abc) can never resolve: treat as not found
    // rather than leaving the skeleton up forever.
    if (!Number.isFinite(conversationId)) {
      setNotFound(true)
      return
    }
    loadInitial()
  }, [authLoading, user, conversationId, loadInitial])

  // Auto-scroll to the bottom only when the newest message changes (initial
  // load or a message appended live), never when older history is prepended.
  const lastMessageId = messages && messages.length ? messages[messages.length - 1].id : null
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant", block: "end" })
  }, [lastMessageId])

  // Load the previous page of history and prepend it, preserving the scroll
  // position so the view does not jump. Fires when the list is scrolled near
  // the top. Reuses the existing dedupe-by-id logic.
  async function loadOlder() {
    if (loadingOlder || !hasMore || !messages || messages.length === 0) return
    setLoadingOlder(true)
    const oldestId = messages[0].id
    const container = listRef.current
    const prevHeight = container?.scrollHeight ?? 0
    try {
      const r = await apiFetch(
        `/api/chat/conversations/${conversationId}/messages?before_id=${oldestId}`
      )
      if (!r.ok) {
        setHasMore(false)
        return
      }
      const older: ChatMessage[] = await r.json()
      if (older.length < MESSAGE_PAGE) setHasMore(false)
      if (older.length > 0) {
        setMessages((prev) => {
          if (!prev) return older
          const existing = new Set(prev.map((m) => m.id))
          return [...older.filter((m) => !existing.has(m.id)), ...prev]
        })
        // Keep the first previously-visible message under the same finger.
        requestAnimationFrame(() => {
          const c = listRef.current
          if (c) c.scrollTop = c.scrollHeight - prevHeight
        })
      }
    } finally {
      setLoadingOlder(false)
    }
  }

  function handleScroll() {
    const c = listRef.current
    if (c && c.scrollTop < 48) loadOlder()
  }

  // Stable send hook for the composer: returns whether the draft was accepted
  // (the composer clears itself only then).
  const handleSend = useCallback(
    (body: string) => {
      if (send(conversationId, body)) {
        clearError()
        return true
      }
      return false
    },
    [send, conversationId, clearError]
  )

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
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1.5"
        >
          {loadingOlder && (
            <p className="text-ink-faint text-xs text-center py-1 shrink-0">Loading earlier messages…</p>
          )}
          {notFound ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-ink-muted text-sm">Conversation not found.</p>
            </div>
          ) : loadError ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="text-ink-muted text-sm">Could not load this conversation.</p>
                <button onClick={loadInitial} className="btn btn-primary px-4 py-1.5 text-sm">
                  Retry
                </button>
              </div>
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
            <MessageList
              messages={messages}
              currentUsername={user?.username}
              isGroup={!!conversation?.is_group}
            />
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input — borderless bar, safe-area aware */}
        <Composer
          canSend={status === "open" && !notFound}
          error={error}
          onSend={handleSend}
        />
      </div>
    </div>
  )
}
