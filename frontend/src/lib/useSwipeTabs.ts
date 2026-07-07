"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// Shared swipe-to-switch-tabs mechanic, extracted from the home feed.
//
// The pattern: tab content lives in a horizontal scroll-snap pager (a flex
// row of full-width pages), and the active-tab indicator pill tracks the
// swipe in real time. A scroll listener interpolates the indicator's left
// and width between the tab buttons' geometry mid-swipe; a scrollend
// listener (with a debounce fallback for older browsers) commits the
// settled page index.
//
// The hook owns the refs and listeners only. Tab labels, fetch effects and
// any per-page extras (sessionStorage restore, strip auto-centering) stay
// at the call site.
//
// Wiring contract:
// - pagerRef     -> the horizontal pager: flex overflow-x-scroll snap-x
//                   snap-mandatory, children w-full shrink-0 snap-start
// - tabRefs      -> each tab button, keyed by index
// - indicatorRef -> the sliding pill, absolutely positioned inside a
//                   relative container that is the buttons' offsetParent
// - selectTab    -> tab click handler (smooth-scrolls the pager)

interface UseSwipeTabsOptions {
  count: number
  initialIndex?: number
  onSettle?: (index: number) => void
}

export function useSwipeTabs({ count, initialIndex = 0, onSettle }: UseSwipeTabsOptions) {
  // Clamp to the current tab set: a persisted index from a larger set (before a
  // tab was removed) must not desync state from reality.
  const startIndex = Math.min(Math.max(0, initialIndex), Math.max(0, count - 1))
  const [activeIndex, setActiveIndex] = useState(startIndex)
  // Indices that have been visited at least once — lets pages mount their
  // content lazily (render a placeholder until first activated).
  const [activatedIndices, setActivatedIndices] = useState<Set<number>>(
    () => new Set([startIndex])
  )
  const activeIndexRef = useRef(startIndex)
  const pagerRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  // Ref so the listener effect never needs to re-subscribe when the caller
  // passes a fresh callback each render.
  const onSettleRef = useRef(onSettle)
  onSettleRef.current = onSettle
  // Lets callers force a re-measure when the tab buttons mount after the
  // pager (e.g. search shows its capsule only once a query exists).
  const updateIndicatorRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const el = pagerRef.current
    if (!el) return

    // The indicator's left and width interpolate between tab button
    // geometry mid-swipe. No transition while dragging — it must stick to
    // the finger.
    function updateIndicator() {
      // clientWidth is 0 for a hidden/mid-layout container; dividing by it makes
      // every downstream measure NaN, so skip until it has a real width.
      if (!el || !indicatorRef.current || el.clientWidth === 0) return
      const progress   = el.scrollLeft / el.clientWidth
      const leftIndex  = Math.max(0,         Math.floor(progress))
      const rightIndex = Math.min(count - 1, Math.ceil(progress))
      const fraction   = progress - Math.floor(progress)

      const leftBtn  = tabRefs.current[leftIndex]
      const rightBtn = tabRefs.current[rightIndex]
      if (!leftBtn || !rightBtn) return

      const width = leftBtn.offsetWidth + (rightBtn.offsetWidth - leftBtn.offsetWidth) * fraction
      const halfInd = width / 2
      const leftX  = leftBtn.offsetLeft  + leftBtn.offsetWidth  / 2 - halfInd
      const rightX = rightBtn.offsetLeft + rightBtn.offsetWidth / 2 - halfInd
      const x      = leftX + (rightX - leftX) * fraction

      indicatorRef.current.style.transition = "none"
      indicatorRef.current.style.width = `${width}px`
      indicatorRef.current.style.left = `${x}px`
    }

    function onSettled() {
      if (!el) return
      // Restore a brief transition so the final snap feels smooth
      if (indicatorRef.current) {
        indicatorRef.current.style.transition =
          "left 0.15s ease-out, width 0.15s ease-out"
      }
      // Guard a zero clientWidth (hidden container): scrollLeft / 0 is NaN, and
      // NaN passes every range/equality check below, committing setActiveIndex(NaN)
      // and poisoning persisted tab state.
      if (el.clientWidth === 0) return
      const index = Math.round(el.scrollLeft / el.clientWidth)
      if (!Number.isFinite(index) || index < 0 || index >= count || index === activeIndexRef.current) return
      activeIndexRef.current = index
      setActiveIndex(index)
      setActivatedIndices((prev) => new Set([...prev, index]))
      onSettleRef.current?.(index)
    }

    // Set initial indicator position
    updateIndicator()
    updateIndicatorRef.current = updateIndicator

    // Resize/rotation leaves scrollLeft mid-page; realign to the active page.
    // Only when the WIDTH actually changed -- a height-only change (content
    // loading into a page) must not rewrite scrollLeft and cancel an in-progress
    // swipe.
    let lastWidth = el.clientWidth
    const resizeObserver = new ResizeObserver(() => {
      const w = el.clientWidth
      if (w !== lastWidth) {
        lastWidth = w
        el.scrollLeft = activeIndexRef.current * w
      }
      updateIndicator()
    })
    resizeObserver.observe(el)

    el.addEventListener("scroll", updateIndicator, { passive: true })

    if ("onscrollend" in el) {
      el.addEventListener("scrollend", onSettled, { passive: true })
      return () => {
        resizeObserver.disconnect()
        el.removeEventListener("scroll", updateIndicator)
        el.removeEventListener("scrollend", onSettled)
      }
    }

    // Fallback for browsers without scrollend: a debounce after scrolling stops.
    // 120ms (up from 50) so a finger resting briefly mid-swipe does not commit an
    // intermediate page before the snap completes.
    // Cast needed: lib.dom assumes scrollend always exists, narrowing el to never here.
    const legacyEl = el as HTMLDivElement
    let timer: ReturnType<typeof setTimeout>
    function onScroll() {
      clearTimeout(timer)
      timer = setTimeout(onSettled, 120)
    }
    legacyEl.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      resizeObserver.disconnect()
      legacyEl.removeEventListener("scroll", updateIndicator)
      legacyEl.removeEventListener("scroll", onScroll)
      clearTimeout(timer)
    }
  }, [count])

  function selectTab(index: number, opts?: { behavior?: ScrollBehavior }) {
    // Clamp so a stale/out-of-range index never scrolls off the pager.
    index = Math.min(Math.max(0, index), Math.max(0, count - 1))
    activeIndexRef.current = index
    setActiveIndex(index)
    setActivatedIndices((prev) => new Set([...prev, index]))
    const behavior = opts?.behavior ?? "smooth"
    if (behavior === "instant") {
      // Instant jumps (e.g. restoring a saved tab on mount) wait one frame
      // so the pager has its final layout before the raw scrollLeft write.
      requestAnimationFrame(() => {
        const el = pagerRef.current
        if (el) el.scrollLeft = index * el.clientWidth
      })
    } else {
      pagerRef.current?.scrollTo({
        left: index * (pagerRef.current.clientWidth),
        behavior,
      })
    }
  }

  const refreshIndicator = useCallback(() => {
    updateIndicatorRef.current?.()
  }, [])

  return { activeIndex, activatedIndices, pagerRef, indicatorRef, tabRefs, selectTab, refreshIndicator }
}
