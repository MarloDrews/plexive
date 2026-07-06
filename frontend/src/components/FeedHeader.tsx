"use client"

import type { MutableRefObject, RefObject } from "react"
import type { FormatId } from "@/lib/formats"

// One feed tab as defined by the TABS array in app/page.tsx.
export interface FeedTab {
  id: string
  label: string
  format: FormatId | null
  accent: string
}

interface FeedHeaderProps {
  tabs: FeedTab[]
  activeTab: string
  onTabClick: (index: number) => void
  onSearch: () => void
  // Refs stay owned by the feed page (via the useSwipeTabs hook, which holds
  // the scroll-sync listeners that position the indicator); buttons are
  // keyed by tab index.
  tabRefs: MutableRefObject<(HTMLButtonElement | null)[]>
  indicatorRef: RefObject<HTMLDivElement | null>
  tabStripRef: RefObject<HTMLDivElement | null>
}

// Stage feed header — a floating frosted capsule detached from the top edge,
// with a separate frosted search circle to its right. The sliding indicator
// is the active pill fill itself: the useSwipeTabs scroll-sync interpolates
// its left and width between tab buttons. The capsule stays neutral; the only
// accent is the format dot on the active tab label.
export default function FeedHeader({
  tabs,
  activeTab,
  onTabClick,
  onSearch,
  tabRefs,
  indicatorRef,
  tabStripRef,
}: FeedHeaderProps) {
  return (
    <div className="absolute top-0 left-0 right-0 z-20">
      <div className="relative pt-3 px-3">
        {/* Floating search circle */}
        <button
          onClick={onSearch}
          aria-label="Search"
          className="absolute right-3 top-3 w-11 h-11 rounded-full backdrop-blur-xl bg-white/[0.06] flex items-center justify-center text-ink-dim hover:text-ink transition-colors duration-150 cursor-pointer z-20"
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
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </button>

        {/* Capsule tab strip — right margin leaves room for the search
            circle, center padding keeps edge tabs snappable. */}
        <div
          ref={tabStripRef}
          className="relative flex overflow-x-scroll snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [scrollbar-width:none] h-11 items-center rounded-full backdrop-blur-xl bg-white/[0.06] mr-[52px] px-[calc(50%-40px)]"
        >
          {tabs.map((tab, i) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                ref={(el) => { tabRefs.current[i] = el }}
                onClick={() => onTabClick(i)}
                className={`snap-center shrink-0 px-4 h-11 flex items-center justify-center cursor-pointer transition-colors duration-200 ${
                  isActive ? "text-ink font-semibold" : "text-ink-muted font-medium"
                }`}
              >
                {/* The format dot is always laid out so the button width never
                    changes with active state (the indicator width interpolation
                    reads button widths live); it only becomes visible on the
                    active tab. */}
                <span className="relative z-10 flex items-center gap-1.5 text-sm whitespace-nowrap">
                  {tab.format && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 transition-opacity duration-200 ${
                        isActive ? "opacity-100" : "opacity-0"
                      }`}
                      style={{ backgroundColor: tab.accent }}
                    />
                  )}
                  {tab.label}
                </span>
              </button>
            )
          })}
          {/* Sliding indicator — the neutral active pill fill, positioned in
              scroll-content space. JS owns inline left and width. */}
          <div
            ref={indicatorRef}
            className="absolute top-1/2 -translate-y-1/2 h-9 rounded-full bg-white/[0.10] pointer-events-none"
            style={{ left: 0 }}
          />
        </div>
      </div>
    </div>
  )
}
