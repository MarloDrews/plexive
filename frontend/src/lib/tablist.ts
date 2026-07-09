// Shared tablist keyboard behavior for FeedHeader and SegmentedTabs (M159 /
// A11Y-012). Both render a roving tabindex: only the active tab is tabbable,
// and Left/Right/Home/End move the selection, focusing the tab they land on.
//
// Selecting on arrow (rather than only on Enter) matches the automatic
// activation pattern, which is what tapping and swiping already do here: the
// panel below always tracks the highlighted tab.

import type { MutableRefObject } from "react"

export function handleTabListKeyDown(
  e: React.KeyboardEvent,
  count: number,
  activeIndex: number,
  onSelect: (index: number) => void,
  tabRefs: MutableRefObject<(HTMLButtonElement | null)[]>
) {
  let next: number
  switch (e.key) {
    case "ArrowRight":
      next = (activeIndex + 1) % count
      break
    case "ArrowLeft":
      next = (activeIndex - 1 + count) % count
      break
    case "Home":
      next = 0
      break
    case "End":
      next = count - 1
      break
    default:
      return
  }
  e.preventDefault()
  onSelect(next)
  tabRefs.current[next]?.focus()
}

// id helpers so a tab and its pager page always agree on aria-controls /
// aria-labelledby.
export const tabId = (base: string, i: number) => `${base}-tab-${i}`
export const tabPanelId = (base: string, i: number) => `${base}-panel-${i}`

// Spread onto a pager page so it is announced as the panel its tab controls.
//
// isActive drives `inert` (A11Y-013): the pagers keep every activated page
// mounted and merely translate them off screen, so without this a Tab press
// walks into a page the user never chose and drags the scroll position with
// it. inert is applied on settle, which is exactly when the hook commits
// activeIndex, so an in-flight swipe is never blocked.
export function tabPanelProps(base: string, i: number, isActive: boolean) {
  return {
    role: "tabpanel",
    id: tabPanelId(base, i),
    "aria-labelledby": tabId(base, i),
    inert: !isActive,
  } as const
}
