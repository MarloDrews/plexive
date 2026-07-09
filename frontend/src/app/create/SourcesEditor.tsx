"use client"

import { memo } from "react"
import { Accordion, FieldError, inputCls, SOURCE_TYPES, emptySource, type Source } from "./formUi"

// Sources editor shared by the generic and Books create forms. The only
// difference between the two call sites was the label input's placeholder.
// Memoized: typing elsewhere in the wizard no longer re-renders the rows.
const SourcesEditor = memo(function SourcesEditor({
  items, onChange, labelPlaceholder, error,
}: {
  items: Source[]
  onChange: (items: Source[]) => void
  labelPlaceholder: string
  error?: string
}) {
  return (
    <Accordion title="Sources (1–10)" required defaultOpen>
      <FieldError msg={error} />
      {items.map((s, i) => (
        <div key={i} className="mb-3 bg-white/[0.04] rounded-2xl p-3">
          <label className="text-ink-faint text-xs mb-1 block">Label *</label>
          <input type="text" value={s.label} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], label: e.target.value }; onChange(n) }} placeholder={labelPlaceholder} className={`${inputCls} mb-2`} />
          <label className="text-ink-faint text-xs mb-1 block">URL *</label>
          <input type="url" value={s.url} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], url: e.target.value }; onChange(n) }} placeholder="https://..." className={`${inputCls} mb-2`} />
          <label className="text-ink-faint text-xs mb-1 block">Type</label>
          <select value={s.type} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], type: e.target.value }; onChange(n) }} className={inputCls}>
            {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      ))}
      <div className="flex gap-3">
        {items.length < 10 && (
          <button onClick={() => onChange([...items, emptySource()])} className="btn btn-quiet text-lamp text-xs px-1.5 py-1">+ Add source</button>
        )}
        {items.length > 1 && (
          <button onClick={() => onChange(items.slice(0, -1))} className="btn btn-quiet text-xs px-1.5 py-1">Remove last</button>
        )}
      </div>
    </Accordion>
  )
})

export default SourcesEditor
