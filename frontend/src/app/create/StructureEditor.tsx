"use client"

import { memo } from "react"
import { Accordion, inputCls } from "./formUi"

// Memoized Structure section (Books, optional): one input per book part.
const StructureEditor = memo(function StructureEditor({
  items,
  onChange,
}: {
  items: string[]
  onChange: (items: string[]) => void
}) {
  return (
    <Accordion title="Structure">
      {items.map((s, i) => (
        <div key={i} className="flex gap-2 mb-2">
          <input type="text" aria-label={`Part ${i + 1}`} value={s} onChange={(e) => { const n = [...items]; n[i] = e.target.value; onChange(n) }} placeholder={`Part ${i + 1}...`} className={`${inputCls} flex-1`} />
          {items.length > 1 && (
            <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} aria-label={`Remove part ${i + 1}`} className="text-ink-muted text-lg w-8 h-10 flex items-center justify-center shrink-0 cursor-pointer"><span aria-hidden="true">×</span></button>
          )}
        </div>
      ))}
      {items.length < 10 && (
        <button onClick={() => onChange([...items, ""])} className="btn btn-quiet text-lamp text-xs px-1.5 py-1 mt-1">+ Add part</button>
      )}
    </Accordion>
  )
})

export default StructureEditor
