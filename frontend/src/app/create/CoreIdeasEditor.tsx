"use client"

import { memo, useId } from "react"
import { Accordion, FieldError, inputCls } from "./formUi"

export const emptyCoreIdea = () => ({ title: "", body: "", in_practice: "", visual_svg: "", image_url: "", quote: "" })
export type CoreIdea = ReturnType<typeof emptyCoreIdea>

// Memoized Core Ideas section (Books): the heaviest block of the wizard
// (6-12 idea groups of 4 inputs each) no longer re-renders when any other
// section is typed in.
const CoreIdeasEditor = memo(function CoreIdeasEditor({
  items,
  onChange,
  error,
}: {
  items: CoreIdea[]
  onChange: (items: CoreIdea[]) => void
  error?: string
}) {
  const uid = useId()
  return (
    <Accordion title="Core Ideas (6–12)" required defaultOpen>
      <FieldError msg={error} />
      {items.map((ci, i) => (
        <div key={i} className="mb-4 bg-white/[0.04] rounded-2xl p-3">
          <p className="text-ink-muted text-xs mb-2">Idea {i + 1}</p>
          <label htmlFor={`${uid}-${i}-title`} className="text-ink-muted text-xs mb-1 block">Title *</label>
          <input type="text" id={`${uid}-${i}-title`} value={ci.title} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], title: e.target.value }; onChange(n) }} placeholder="Concept name..." className={`${inputCls} mb-2`} />
          <label htmlFor={`${uid}-${i}-body`} className="text-ink-muted text-xs mb-1 block">Body *</label>
          <textarea id={`${uid}-${i}-body`} value={ci.body} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], body: e.target.value }; onChange(n) }} rows={3} placeholder="Explain the idea..." className={`${inputCls} resize-none mb-2`} />
          <label htmlFor={`${uid}-${i}-in-practice`} className="text-ink-muted text-xs mb-1 block">In practice (optional)</label>
          <input type="text" id={`${uid}-${i}-in-practice`} value={ci.in_practice} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], in_practice: e.target.value }; onChange(n) }} placeholder="How to apply this..." className={`${inputCls} mb-2`} />
          <label htmlFor={`${uid}-${i}-quote`} className="text-ink-muted text-xs mb-1 block">Pull quote (optional)</label>
          <input type="text" id={`${uid}-${i}-quote`} value={ci.quote} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], quote: e.target.value }; onChange(n) }} placeholder="A notable quote..." className={inputCls} />
        </div>
      ))}
      <div className="flex gap-3">
        {items.length < 12 && (
          <button onClick={() => onChange([...items, emptyCoreIdea()])} className="btn btn-quiet text-lamp text-xs px-1.5 py-1">+ Add idea</button>
        )}
        {items.length > 6 && (
          <button onClick={() => onChange(items.slice(0, -1))} className="btn btn-quiet text-xs px-1.5 py-1">Remove last</button>
        )}
      </div>
    </Accordion>
  )
})

export default CoreIdeasEditor
