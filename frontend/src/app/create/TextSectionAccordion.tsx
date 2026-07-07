"use client"

import { memo } from "react"
import { Accordion, FieldError, inputCls } from "./formUi"

// One memoized accordion for every plain-textarea section of the wizard
// (essence, heart, body, the optional context sections). The parent passes a
// stable onChange per section, so typing in any other section leaves this one
// untouched instead of re-rendering the whole step-3 tree per keystroke.
const TextSectionAccordion = memo(function TextSectionAccordion({
  title,
  required,
  defaultOpen,
  hint,
  rows,
  maxLength,
  placeholder,
  value,
  onChange,
  error,
}: {
  title: string
  required?: boolean
  defaultOpen?: boolean
  hint?: string
  rows: number
  maxLength?: number
  placeholder: string
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  return (
    <Accordion title={title} required={required} defaultOpen={defaultOpen}>
      {hint && <p className="text-ink-muted text-xs mb-2">{hint}</p>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className={`${inputCls} resize-none`}
      />
      <FieldError msg={error} />
    </Accordion>
  )
})

export default TextSectionAccordion
