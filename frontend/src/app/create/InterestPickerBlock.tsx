"use client"

import { memo } from "react"
import { FieldError, type Interest } from "./formUi"

// Interest picker block shared by the generic and Books create forms (the two
// call sites were byte-identical). Renders the category-grouped pills over the
// caller's selection state. Memoized: typing elsewhere in the wizard no longer
// re-renders the ~140 pills.
const InterestPickerBlock = memo(function InterestPickerBlock({
  sections, selected, onToggle, error, max = 5,
}: {
  sections: { label: string; items: Interest[] }[]
  selected: string[]
  onToggle: (slug: string) => void
  error?: string
  max?: number
}) {
  // At the cap, the counter highlights and the remaining pills dim so the
  // limit is visible at the moment it binds instead of a tap silently doing
  // nothing (the cap of 5 is a product choice; the backend accepts up to 10).
  const atMax = selected.length >= max
  return (
    <div className="card px-4 pb-4 pt-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <p className="label-caps text-lamp">Interests *</p>
        <span className={`text-xs font-mono ${atMax ? "text-lamp" : "text-ink-muted"}`}>
          {selected.length}/{max}{atMax ? " (max)" : ""}
        </span>
      </div>
      <FieldError msg={error} />
      {sections.map((sec) => (
        <div key={sec.label} className="mb-3">
          <p className="text-ink-muted text-xs mb-1.5">{sec.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {sec.items.map((interest) => {
              const isSelected = selected.includes(interest.slug)
              return (
                <button
                  key={interest.slug}
                  onClick={() => onToggle(interest.slug)}
                  aria-pressed={isSelected}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                    isSelected
                      ? "bg-white/[0.12] text-ink cursor-pointer"
                      : atMax
                        ? "bg-white/[0.04] text-ink-muted opacity-50 cursor-default"
                        : "bg-white/[0.04] text-ink-dim cursor-pointer"
                  }`}
                >
                  {interest.name}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
})

export default InterestPickerBlock
