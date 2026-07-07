"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import useSWR from "swr"
import BottomNav from "@/components/BottomNav"
import Avatar from "@/components/Avatar"
import VerifiedBadge from "@/components/VerifiedBadge"
import { apiFetch } from "@/lib/api"
import { useAuth, hasToken } from "@/lib/auth"
import { relativeTime } from "@/lib/relativeTime"
import type { ChatParticipant, Conversation } from "@/lib/chatSocket"

interface UserResult {
  username: string
  is_verified: number
  avatar_url: string | null
  is_self: boolean
}

function ConversationAvatar({ conv, me }: { conv: Conversation; me: string }) {
  if (conv.is_group) {
    return (
      <div className="w-[48px] h-[48px] rounded-full bg-white/[0.06] flex items-center justify-center shrink-0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-ink-dim">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
    )
  }
  const other = conv.participants.find((p) => p.username !== me)
  return <Avatar username={other?.username ?? "?"} avatarUrl={other?.avatar_url} size={48} verified={other?.is_verified} />
}

function NewChatOverlay({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<UserResult[]>([])
  const [selected, setSelected] = useState<UserResult[]>([])
  const [groupName, setGroupName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Guards against a slow response for an earlier query landing after a later one.
  const searchSeq = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      return
    }
    const seq = ++searchSeq.current
    const timer = setTimeout(async () => {
      try {
        const r = await apiFetch(`/api/search/users?${new URLSearchParams({ q: trimmed })}`)
        if (!r.ok) return
        const data = ((await r.json()) as UserResult[]).filter((u) => !u.is_self)
        if (seq === searchSeq.current) setResults(data)
      } catch {
        // Swallow so a failed lookup is not an unhandled rejection.
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  function toggle(user: UserResult) {
    setError(null)
    setSelected((prev) =>
      prev.some((u) => u.username === user.username)
        ? prev.filter((u) => u.username !== user.username)
        : [...prev, user]
    )
  }

  async function start() {
    if (selected.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await apiFetch("/api/chat/conversations", {
        method: "POST",
        body: JSON.stringify({
          usernames: selected.map((u) => u.username),
          name: selected.length > 1 && groupName.trim() ? groupName.trim() : null,
        }),
      })
      const data = await r.json()
      if (!r.ok) {
        setError(typeof data.detail === "string" ? data.detail : "Could not start the conversation.")
        return
      }
      onCreated(data.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="absolute inset-0 z-40 bg-surface-0 flex flex-col">
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="btn-icon shrink-0" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <p className="font-serif text-ink font-medium text-base">New chat</p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people you followâ€¦"
          autoFocus
          className="field rounded-full mt-2 text-sm py-2.5"
        />
        {selected.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {selected.map((u) => (
              <button
                key={u.username}
                onClick={() => toggle(u)}
                className="flex items-center gap-1.5 bg-white/[0.06] rounded-full pl-1 pr-2.5 py-1 text-xs text-ink cursor-pointer"
              >
                <Avatar username={u.username} avatarUrl={u.avatar_url} size={20} />
                @{u.username}
                <span className="text-ink-muted">Ã—</span>
              </button>
            ))}
          </div>
        )}
        {selected.length > 1 && (
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name (optional)"
            maxLength={80}
            className="field rounded-full mt-2 text-sm py-2.5"
          />
        )}
        {error && <p className="text-bad text-xs mt-2">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        {results.map((u) => {
          const isSelected = selected.some((s) => s.username === u.username)
          return (
            <button
              key={u.username}
              onClick={() => toggle(u)}
              className="w-full flex items-center gap-3 py-2.5 text-left cursor-pointer"
            >
              <Avatar username={u.username} avatarUrl={u.avatar_url} size={40} verified={u.is_verified} />
              <span className="flex-1 flex items-center gap-1.5 text-ink text-sm font-medium truncate">
                @{u.username}
                {u.is_verified > 0 && <VerifiedBadge size={14} level={u.is_verified} />}
              </span>
              <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? "bg-lamp border-lamp" : "border-edge-strong"}`}>
                {isSelected && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-surface-0)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </span>
            </button>
          )
        })}
        {query.trim() && results.length === 0 && (
          <p className="text-ink-muted text-xs text-center pt-8">No accounts found</p>
        )}
      </div>

      <div className="px-3 py-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
        <button
          onClick={start}
          disabled={selected.length === 0 || busy}
          className="btn btn-primary w-full py-2.5"
        >
          {busy ? "Startingâ€¦" : selected.length > 1 ? "Start group chat" : "Start chat"}
        </button>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [showNew, setShowNew] = useState(false)

  // Conversation list via SWR, gated on token presence rather than the /me
  // round trip so the list starts loading during session restore. Revisits
  // render the cached list instantly; the default revalidate-on-mount keeps new
  // messages appearing on each visit.
  const { data: convData, error: convError } = useSWR<Conversation[]>(
    hasToken() ? "/api/chat/conversations" : null
  )
  const conversations: Conversation[] | null = convError ? [] : convData ?? null

  function preview(conv: Conversation): string {
    if (!conv.last_message) return "No messages yet"
    const prefix = conv.is_group && conv.last_message.sender_username ? `${conv.last_message.sender_username}: ` : ""
    return prefix + conv.last_message.body
  }

  function subtitle(participants: ChatParticipant[]): string {
    return participants.map((p) => `@${p.username}`).join(", ")
  }

  return (
    <div className="h-[100dvh] bg-surface-0 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative flex flex-col">

        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h1 className="font-serif text-ink font-medium text-xl">Chats</h1>
          {user && (
            <button
              onClick={() => setShowNew(true)}
              className="btn-icon"
              aria-label="New chat"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pb-24">
          {!authLoading && !user ? (
            <div className="h-full flex items-center justify-center px-6">
              <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-3">
                <p className="font-serif text-ink font-medium text-lg">Message people you follow</p>
                <Link href="/login" className="btn btn-primary px-5 py-2">
                  Log in
                </Link>
              </div>
            </div>
          ) : conversations === null ? (
            // Loading: pulsing slab rows where conversations will appear.
            <div className="flex flex-col gap-2 px-3 pt-2">
              <div className="stage-pulse card h-16 w-full" />
              <div className="stage-pulse card h-16 w-full" />
              <div className="stage-pulse card h-16 w-full" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="h-full flex items-center justify-center px-6">
              <div className="card px-8 py-10 text-center max-w-xs flex flex-col items-center gap-3">
                <p className="font-serif text-ink font-medium text-lg">No chats yet</p>
                <p className="text-ink-muted text-sm">Start a conversation with someone you follow.</p>
                <button onClick={() => setShowNew(true)} className="btn btn-primary px-5 py-2">
                  New chat
                </button>
              </div>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => router.push(`/chat/${conv.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer active:bg-white/[0.05] hover:bg-white/[0.05] transition-colors duration-150"
              >
                <ConversationAvatar conv={conv} me={user?.username ?? ""} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-ink text-sm font-semibold truncate">{conv.name}</p>
                    {conv.last_message?.created_at && (
                      <span className="text-ink-faint text-xs shrink-0 font-mono">{relativeTime(conv.last_message.created_at)}</span>
                    )}
                  </div>
                  <p className="text-ink-muted text-xs truncate">{preview(conv)}</p>
                  {conv.is_group && (
                    <p className="text-ink-faint text-xs truncate">{subtitle(conv.participants)}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {showNew && (
          <NewChatOverlay
            onClose={() => setShowNew(false)}
            onCreated={(id) => router.push(`/chat/${id}`)}
          />
        )}

        <BottomNav activeTab="chat" />
      </div>
    </div>
  )
}
