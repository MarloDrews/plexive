"use client"

import { useRouter } from "next/navigation"
import { useAuth } from "@/app/lib/auth"

type ActiveTab = "feed" | "search" | "create" | "stats" | "profile"

export default function BottomNav({ activeTab }: { activeTab: ActiveTab }) {
  const router = useRouter()
  const { user } = useAuth()

  function icon(tab: ActiveTab) {
    return activeTab === tab ? "text-white" : "text-zinc-500"
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-30 bg-surface-overlay backdrop-blur-md border-t border-edge"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="h-14 flex">
        {/* Search */}
        <button
          onClick={() => router.push("/search")}
          className={`flex-1 flex items-center justify-center h-full ${icon("search")}`}
          aria-label="Search"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </button>

        {/* Stats */}
        <button
          onClick={() => router.push("/stats")}
          className={`flex-1 flex items-center justify-center h-full ${icon("stats")}`}
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
          className={`flex-1 flex items-center justify-center h-full ${icon("feed")}`}
          aria-label="Feed"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z" />
          </svg>
        </button>

        {/* Create — white when logged in, dimmed when logged out */}
        <button
          onClick={() => router.push("/create")}
          className={`flex-1 flex items-center justify-center h-full ${user ? "text-white" : "text-zinc-500"}`}
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
          onClick={() => router.push(user ? "/profile" : "/login")}
          className={`flex-1 flex items-center justify-center h-full ${icon("profile")}`}
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
