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
  return (
    <div className="card px-4 pb-4 pt-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <p className="label-caps text-lamp">Interests *</p>
        <span className="text-ink-muted text-xs font-mono">{selected.length}/{max}</span>
      </div>
      <FieldError msg={error} />
      {sections.map((sec) => (
        <div key={sec.label} className="mb-3">
          <p className="text-ink-faint text-xs mb-1.5">{sec.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {sec.items.map((interest) => {
              const isSelected = selected.includes(interest.slug)
              return (
                <button
                  key={interest.slug}
                  onClick={() => onToggle(interest.slug)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors duration-150 ${isSelected ? "bg-white/[0.12] text-ink" : "bg-white/[0.04] text-ink-dim"}`}
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
