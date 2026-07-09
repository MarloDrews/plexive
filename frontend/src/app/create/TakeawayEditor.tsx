"use client"

import { memo, useId } from "react"
import { Accordion, FieldError, inputCls } from "./formUi"

export const emptyTakeaway = () => ({
  framing: "framework" as "framework" | "question",
  body: "",
  visual_svg: "",
})
export type TakeawayState = ReturnType<typeof emptyTakeaway>

// Memoized Takeaway section (Books). The parent's onChange also clears the
// section's validation error.
const TakeawayEditor = memo(function TakeawayEditor({
  value,
  onChange,
  error,
}: {
  value: TakeawayState
  onChange: (value: TakeawayState) => void
  error?: string
}) {
  const uid = useId()
  return (
    <Accordion title="Takeaway" required defaultOpen>
      <FieldError msg={error} />
      <label htmlFor={`${uid}-framing`} className="text-ink-muted text-xs mb-1 block">Framing</label>
      <select id={`${uid}-framing`} value={value.framing} onChange={(e) => onChange({ ...value, framing: e.target.value as "framework" | "question" })} className={`${inputCls} mb-3`}>
        <option value="framework">Framework (a model or principle)</option>
        <option value="question">Question (a reflection prompt)</option>
      </select>
      <label htmlFor={`${uid}-body`} className="text-ink-muted text-xs mb-1 block">Body *</label>
      <textarea id={`${uid}-body`} value={value.body} onChange={(e) => onChange({ ...value, body: e.target.value })} rows={3} placeholder="The key thing to take away..." className={`${inputCls} resize-none`} />
    </Accordion>
  )
})

export default TakeawayEditor
