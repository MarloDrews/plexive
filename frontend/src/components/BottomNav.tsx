"use client"

import React, { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"

// "search" stays in the union for the search page, which now lives behind the
// top-right button on the feed and highlights nothing down here.
type ActiveTab = "feed" | "search" | "chat" | "create" | "stats" | "profile"

interface NavItem {
  id: "chat" | "stats" | "feed" | "create" | "profile"
  label: string
  active: boolean
  onClick: () => void
  // Inner SVG content (24x24 viewBox paths only).
  icon: React.ReactNode
}

const NAV_ICONS: Record<NavItem["id"], React.ReactNode> = {
  chat: (
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  ),
  // Line chart (axes + rising trend), not ascending bars — bars read as a
  // mobile-signal indicator at nav size.
  stats: (
    <>
      <path d="M3 3v18h18" />
      <path d="m7 14 4-4 3 3 5-6" />
    </>
  ),
  feed: (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z" />
  ),
  create: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
}

// Stage bottom nav — a frosted pill dock floating inset from every edge.
// Active state is a filled neutral circle (functional, never glow).
export default function BottomNav({ activeTab }: { activeTab: ActiveTab }) {
  const router = useRouter()
  const { user } = useAuth()

  // Prefetch the sibling routes so the first tap on a nav item does not pay
  // the route-chunk download (no-op in dev; effective in production builds).
  // /stats is deliberately NOT prefetched: its tabs pull the recharts chunk,
  // which most sessions never need; the stats page lazy-loads them itself.
  useEffect(() => {
    router.prefetch("/")
    router.prefetch("/chat")
    router.prefetch("/create")
    if (user) router.prefetch(`/profile/${user.username}`)
  }, [router, user])

  const items: NavItem[] = [
    { id: "chat", label: "Chat", active: activeTab === "chat", onClick: () => router.push("/chat"), icon: NAV_ICONS.chat },
    { id: "stats", label: "Stats", active: activeTab === "stats", onClick: () => router.push("/stats"), icon: NAV_ICONS.stats },
    { id: "feed", label: "Feed", active: activeTab === "feed", onClick: () => router.push("/"), icon: NAV_ICONS.feed },
    { id: "create", label: "Create", active: activeTab === "create", onClick: () => router.push("/create"), icon: NAV_ICONS.create },
    { id: "profile", label: "Profile", active: activeTab === "profile", onClick: () => router.push(user ? `/profile/${user.username}` : "/login"), icon: NAV_ICONS.profile },
  ]

  return (
    <div
      className="absolute left-4 right-4 z-30"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
    >
      <div className="h-14 rounded-full backdrop-blur-xl bg-white/[0.06] flex items-center justify-around px-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={item.onClick}
            aria-label={item.label}
            className={`w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-95 ${
              item.active ? "bg-white/[0.12] text-ink" : "text-ink-muted hover:text-ink-dim"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              {item.icon}
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
