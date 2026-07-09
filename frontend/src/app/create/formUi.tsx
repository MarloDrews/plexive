"use client"

// Shared form primitives for the create wizard, used by the page itself and the
// extracted section editors (QuizEditor, SourcesEditor, InterestPickerBlock).

import { useId, useState } from "react"

export interface Interest {
  id: number
  name: string
  slug: string
}

export const inputCls = "field text-sm py-3"
export const labelCls = "label-caps mb-2 mt-4 block"

// role="alert" so a validation message that appears after submit is announced
// without moving focus (A11Y-016). The optional id lets a caller wire the
// message to its input with aria-describedby.
export function FieldError({ msg, id }: { msg: string | undefined; id?: string }) {
  if (!msg) return null
  return <p id={id} role="alert" className="text-bad text-xs mt-1">{msg}</p>
}

export function Accordion({
  title, required, children, defaultOpen,
}: {
  title: string; required?: boolean; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const panelId = useId()
  return (
    <div className="card overflow-hidden mb-3">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
      >
        <span className="text-sm font-medium text-ink">{title}</span>
        <div className="flex items-center gap-2">
          {required && (
            <span className="text-xs text-lamp bg-lamp/15 rounded-full px-2 py-0.5">
              Required
            </span>
          )}
          {!required && (
            <span className="text-xs text-ink-muted bg-white/[0.06] rounded-full px-2 py-0.5">
              Optional
            </span>
          )}
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={`text-ink-dim transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>
      {open && <div id={panelId} className="px-4 pb-4 pt-3 bg-surface-0/40">{children}</div>}
    </div>
  )
}

export const emptyQuizItem = () => ({ question: "", options: ["", "", "", ""] as [string, string, string, string], answer_index: "0" as "0"|"1"|"2"|"3", explanation: "" })
export const emptySource = () => ({ label: "", url: "", type: "article" as string })

export type QuizItem = ReturnType<typeof emptyQuizItem>
export type Source = ReturnType<typeof emptySource>

export const SOURCE_TYPES = ["wikipedia", "paper", "book", "article", "database"]
