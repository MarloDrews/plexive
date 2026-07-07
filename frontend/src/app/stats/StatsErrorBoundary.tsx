"use client"

import React, { type ReactNode } from "react"

export default class StatsErrorBoundary extends React.Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: "" }
  }
  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error: String(error) }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-bad text-sm">
          <p className="font-bold mb-2">Stats page error:</p>
          <p>{this.state.error}</p>
        </div>
      )
    }
    return this.props.children
  }
}
