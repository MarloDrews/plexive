"use client"

import { memo } from "react"
import { Accordion, FieldError, inputCls } from "./formUi"

export const emptyVoice = () => ({ quote: "", attribution: "" })
export type Voice = ReturnType<typeof emptyVoice>

// Memoized voices section (Books): typing elsewhere in the wizard no longer
// re-renders the quote rows.
const VoicesEditor = memo(function VoicesEditor({
  items,
  onChange,
  error,
}: {
  items: Voice[]
  onChange: (items: Voice[]) => void
  error?: string
}) {
  return (
    <Accordion title="Voices (3–4 quotes)" required defaultOpen>
      <FieldError msg={error} />
      {items.map((v, i) => (
        <div key={i} className="mb-3 bg-white/[0.04] rounded-2xl p-3">
          <p className="text-ink-muted text-xs mb-2">Quote {i + 1}</p>
          <textarea aria-label={`Quote ${i + 1} text`} value={v.quote} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], quote: e.target.value }; onChange(n) }} rows={2} placeholder="Quote text..." className={`${inputCls} resize-none mb-2`} />
          <input type="text" aria-label={`Quote ${i + 1} attribution`} value={v.attribution} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], attribution: e.target.value }; onChange(n) }} placeholder="Attribution (name, role, page, etc.)" className={inputCls} />
        </div>
      ))}
      {items.length < 4 && (
        <button onClick={() => onChange([...items, emptyVoice()])} className="btn btn-quiet text-lamp text-xs px-1.5 py-1">+ Add quote</button>
      )}
      {items.length > 3 && (
        <button onClick={() => onChange(items.slice(0, -1))} className="btn btn-quiet text-xs px-1.5 py-1 ml-3">Remove last</button>
      )}
    </Accordion>
  )
})

export default VoicesEditor
