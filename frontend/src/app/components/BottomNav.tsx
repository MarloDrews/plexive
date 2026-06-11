"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/app/lib/auth"

// "search" stays in the union for the search page, which now lives behind the
// top-right button on the feed and highlights nothing down here.
type ActiveTab = "feed" | "search" | "chat" | "create" | "stats" | "profile"

export default function BottomNav({ activeTab }: { activeTab: ActiveTab }) {
  const router = useRouter()
  const { user } = useAuth()

  function icon(tab: ActiveTab) {
    return activeTab === tab ? "text-lamp" : "text-ink-muted hover:text-ink-dim"
  }

  function glowStyle(tab: ActiveTab): React.CSSProperties | undefined {
    return activeTab === tab
      ? { filter: "drop-shadow(0 0 8px rgb(124 111 255 / 1)) drop-shadow(0 0 22px rgb(124 111 255 / 0.8))" }
      : undefined
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-30 bg-surface-overlay backdrop-blur-md border-t border-edge"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        boxShadow: "0 -20px 50px rgb(124 111 255 / 0.18), 0 -50px 100px rgb(91 168 224 / 0.07)",
      }}
    >
      <div className="h-14 flex">
        {/* Chat */}
        <button
          onClick={() => router.push("/chat")}
          className={`flex-1 flex items-center justify-center h-full cursor-pointer transition-colors duration-150 ${icon("chat")}`}
          style={glowStyle("chat")}
          aria-label="Chat"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </button>

        {/* Stats */}
        <button
          onClick={() => router.push("/stats")}
          className={`flex-1 flex items-center justify-center h-full cursor-pointer transition-colors duration-150 ${icon("stats")}`}
          style={glowStyle("stats")}
          aria-label="Stats"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <rect x="18" y="3" width="3" height="18" />
            <rect x="11" y="8" width="3" height="13" />
            <rect x="4" y="13" width="3" height="8" />
          </svg>
        </button>

        {/* Feed */}
        <button
          onClick={() => router.push("/")}
          className={`flex-1 flex items-center justify-center h-full cursor-pointer transition-colors duration-150 ${icon("feed")}`}
          style={glowStyle("feed")}
          aria-label="Feed"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z" />
          </svg>
        </button>

        {/* Create — always dimmed like other inactive nav items */}
        <button
          onClick={() => router.push("/create")}
          className={`flex-1 flex items-center justify-center h-full cursor-pointer transition-colors duration-150 ${icon("create")}`}
          style={glowStyle("create")}
          aria-label="Create"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </button>

        {/* Profile */}
        <button
          onClick={() => router.push(user ? `/profile/${user.username}` : "/login")}
          className={`flex-1 flex items-center justify-center h-full cursor-pointer transition-colors duration-150 ${icon("profile")}`}
          style={glowStyle("profile")}
          aria-label="Profile"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
