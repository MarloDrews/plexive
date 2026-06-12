"use client"

import type { MutableRefObject, RefObject } from "react"

// Stage segmented capsule with a sliding indicator — the equal-width
// frosted switcher used by stats, the public profile and search. Wired to
// a useSwipeTabs instance: the hook owns the indicator's left/width (it
// interpolates them against the buttons mid-swipe), this component owns
// the markup. The settled look matches the old static capsules exactly
// (active fill bg-white/12%); the indicator just makes that fill slide.

interface SegmentedTabsProps {
  labels: string[]
  activeIndex: number
  onSelect: (index: number) => void
  tabRefs: MutableRefObject<(HTMLButtonElement | null)[]>
  indicatorRef: RefObject<HTMLDivElement | null>
  className?: string
}

export default function SegmentedTabs({
  labels,
  activeIndex,
  onSelect,
  tabRefs,
  indicatorRef,
  className = "",
}: SegmentedTabsProps) {
  return (
    // relative makes the capsule the offsetParent shared by the buttons and
    // the absolute indicator, so the hook's offsetLeft math lines up.
    <div
      className={`relative h-11 rounded-full backdrop-blur-xl bg-white/[0.06] flex items-center p-1 gap-1 ${className}`}
    >
      {/* Sliding indicator — starts at width 0 (invisible) until the hook's
          mount effect measures the buttons and positions it. */}
      <div
        ref={indicatorRef}
        className="absolute top-1 h-9 rounded-full bg-white/[0.12] pointer-events-none"
        style={{ left: 0, width: 0 }}
      />
      {labels.map((label, i) => (
        <button
          key={label}
          ref={(el) => { tabRefs.current[i] = el }}
          onClick={() => onSelect(i)}
          className={`relative z-10 flex-1 h-9 rounded-full text-sm cursor-pointer transition-colors duration-150 ${
            activeIndex === i
              ? "text-ink font-semibold"
              : "text-ink-muted font-medium hover:text-ink-dim"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
