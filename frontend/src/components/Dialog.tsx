"use client"

// The one modal shell (M155 / A11Y-004). Every sheet and overlay in the app
// used to be a bare positioned div: no dialog role, no focus move, no trap, no
// Escape, and the page behind stayed reachable by Tab and by a screen reader.
//
// This wrapper portals to document.body, which is what makes the inert trick
// work: the app's content lives inside <main id="app-root"> (see layout.tsx),
// so marking that element inert disables the whole background without ever
// touching the dialog itself. The counter handles nested or overlapping
// dialogs, so the last one to close is the one that lifts inert.

import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

// How many dialogs currently hold the background inert.
let openDialogCount = 0

function acquireBackgroundInert() {
  openDialogCount += 1
  if (openDialogCount === 1) {
    document.getElementById("app-root")?.setAttribute("inert", "")
  }
}

function releaseBackgroundInert() {
  openDialogCount = Math.max(0, openDialogCount - 1)
  if (openDialogCount === 0) {
    document.getElementById("app-root")?.removeAttribute("inert")
  }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("inert") && !el.closest("[inert]")
  )
}

interface Props {
  // Names the dialog for screen readers.
  label: string
  onClose: () => void
  // Backdrop click closes by default, matching the sheets' existing behavior.
  onBackdropClick?: () => void
  // Classes for the full-screen positioning layer, which is also the dialog
  // element, so callers keep their exact layout and no extra box appears.
  className?: string
  children: ReactNode
}

export default function Dialog({ label, onClose, onBackdropClick, className = "", children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Whatever opened the dialog, captured on the first render (before the
  // portal exists), so an autoFocus'd field inside cannot be mistaken for it.
  // Focus returns here on unmount.
  const invokerRef = useRef<HTMLElement | null>(null)
  if (invokerRef.current === null && typeof document !== "undefined") {
    invokerRef.current = document.activeElement as HTMLElement | null
  }

  // Portals need document.body, which does not exist during SSR. Rendering
  // null on the first pass also keeps hydration in step.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Latest onClose without re-running the mount effect (callers pass a fresh
  // closure each render).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!mounted) return
    const panel = panelRef.current
    if (!panel) return

    acquireBackgroundInert()

    // Move focus in, unless a child already claimed it with autoFocus.
    if (!panel.contains(document.activeElement)) {
      const first = focusableWithin(panel)[0]
      if (first) first.focus()
      else panel.focus()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== "Tab") return
      const items = focusableWithin(panel!)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      const active = document.activeElement
      // Wrap at both ends so Tab can never leave the dialog.
      if (e.shiftKey && (active === firstItem || active === panel)) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown, true)
    const invoker = invokerRef.current
    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      releaseBackgroundInert()
      // The invoker may have been unmounted while the dialog was open.
      if (invoker?.isConnected) invoker.focus()
    }
  }, [mounted])

  if (!mounted) return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className={className}
      onClick={onBackdropClick ?? onClose}
    >
      {children}
    </div>,
    document.body
  )
}
