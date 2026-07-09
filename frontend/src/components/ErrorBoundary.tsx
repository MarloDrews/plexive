"use client"

import React, { type ReactNode } from "react"

// Reusable render error boundary. Wrapping a subtree in this contains any throw
// during its render/commit to that subtree: the boundary swaps in `fallback`
// instead of letting the throw unmount everything up to the nearest App Router
// error.tsx. Used per-section in SectionRenderer so one malformed section
// degrades to a small notice while the rest of the post renders.
//
// State is keyed by the caller's React key (e.g. per post + section), so a fresh
// subtree gets a fresh boundary and a prior failure never sticks to new content.
export default class ErrorBoundary extends React.Component<
  { children: ReactNode; fallback?: ReactNode; onError?: (error: unknown) => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: unknown) {
    this.props.onError?.(error)
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}
