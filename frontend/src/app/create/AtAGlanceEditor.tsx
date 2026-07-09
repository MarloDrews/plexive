"use client"

import { memo } from "react"
import { Accordion, FieldError, inputCls } from "./formUi"

export const emptyAtAGlance = () => ({
  genre: "", year: "", country: "", pages: "",
  reading_ease: "2" as "1" | "2" | "3",
  post_difficulty: "2" as "1" | "2" | "3",
  best_for: "",
})
export type AtAGlanceState = ReturnType<typeof emptyAtAGlance>

// Memoized At a Glance section (Books).
const AtAGlanceEditor = memo(function AtAGlanceEditor({
  value,
  onChange,
  error,
}: {
  value: AtAGlanceState
  onChange: (value: AtAGlanceState) => void
  error?: string
}) {
  return (
    <Accordion title="At a Glance" required defaultOpen>
      <FieldError msg={error} />
      <div className="grid grid-cols-2 gap-2">
        {[
          { key: "genre" as const, label: "Genre", placeholder: "Psychology" },
          { key: "year" as const, label: "Year", placeholder: "2011" },
          { key: "country" as const, label: "Country", placeholder: "United States" },
          { key: "pages" as const, label: "Pages", placeholder: "499" },
          { key: "best_for" as const, label: "Best for", placeholder: "Curious minds" },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="text-ink-muted text-xs mb-1 block">{label}</label>
            <input type="text" value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })} placeholder={placeholder} className={inputCls} />
          </div>
        ))}
        <div>
          <label className="text-ink-muted text-xs mb-1 block">Reading ease</label>
          <select value={value.reading_ease} onChange={(e) => onChange({ ...value, reading_ease: e.target.value as "1" | "2" | "3" })} className={inputCls}>
            <option value="1">1 — Easy</option><option value="2">2 — Moderate</option><option value="3">3 — Dense</option>
          </select>
        </div>
        <div>
          <label className="text-ink-muted text-xs mb-1 block">Difficulty</label>
          <select value={value.post_difficulty} onChange={(e) => onChange({ ...value, post_difficulty: e.target.value as "1" | "2" | "3" })} className={inputCls}>
            <option value="1">1 — Easy</option><option value="2">2 — Medium</option><option value="3">3 — Hard</option>
          </select>
        </div>
      </div>
    </Accordion>
  )
})

export default AtAGlanceEditor
