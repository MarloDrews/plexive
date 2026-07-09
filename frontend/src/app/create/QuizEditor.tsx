"use client"

import { memo, useId } from "react"
import { Accordion, FieldError, inputCls, emptyQuizItem, type QuizItem } from "./formUi"

// Quiz editor shared by the generic and Books create forms. The only difference
// between the two call sites was the radio-group name prefix, so it is a prop.
// Memoized: typing elsewhere in the wizard no longer re-renders the 5-10
// question groups of 6 inputs each.
const QuizEditor = memo(function QuizEditor({
  items, onChange, radioNamePrefix, error,
}: {
  items: QuizItem[]
  onChange: (items: QuizItem[]) => void
  radioNamePrefix: string
  error?: string
}) {
  // Namespaces the per-question ids; the editor renders twice (generic and
  // Books) and each question repeats the same fields.
  const uid = useId()
  return (
    <Accordion title="Quiz (5–10 questions)" required defaultOpen>
      <FieldError msg={error} />
      {items.map((q, i) => (
        <div key={i} className="mb-4 bg-white/[0.04] rounded-2xl p-3">
          <p className="text-ink-muted text-xs mb-2">Question {i + 1}</p>
          <label htmlFor={`${uid}-q${i}-text`} className="text-ink-faint text-xs mb-1 block">Question text *</label>
          <textarea id={`${uid}-q${i}-text`} value={q.question} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], question: e.target.value }; onChange(n) }} rows={2} className={`${inputCls} resize-none mb-2`} />
          {(["A", "B", "C", "D"] as const).map((opt, j) => (
            <div key={j} className="flex items-center gap-2 mb-1.5">
              <input
                type="radio"
                name={`${radioNamePrefix}${i}`}
                aria-label={`Correct answer: option ${opt}`}
                checked={q.answer_index === String(j) as "0"|"1"|"2"|"3"}
                onChange={() => { const n = [...items]; n[i] = { ...n[i], answer_index: String(j) as "0"|"1"|"2"|"3" }; onChange(n) }}
                className="shrink-0 accent-lamp"
              />
              <input
                type="text"
                aria-label={`Question ${i + 1}, option ${opt}`}
                value={q.options[j]}
                onChange={(e) => { const n = [...items]; const opts = [...n[i].options] as [string,string,string,string]; opts[j] = e.target.value; n[i] = { ...n[i], options: opts }; onChange(n) }}
                placeholder={`Option ${opt}`}
                className={`${inputCls} flex-1`}
              />
            </div>
          ))}
          <label htmlFor={`${uid}-q${i}-explanation`} className="text-ink-faint text-xs mb-1 block mt-2">Explanation *</label>
          <textarea id={`${uid}-q${i}-explanation`} value={q.explanation} onChange={(e) => { const n = [...items]; n[i] = { ...n[i], explanation: e.target.value }; onChange(n) }} rows={2} placeholder="Why this is the correct answer..." className={`${inputCls} resize-none`} />
        </div>
      ))}
      <div className="flex gap-3">
        {items.length < 10 && (
          <button onClick={() => onChange([...items, emptyQuizItem()])} className="btn btn-quiet text-lamp text-xs px-1.5 py-1">+ Add question</button>
        )}
        {items.length > 5 && (
          <button onClick={() => onChange(items.slice(0, -1))} className="btn btn-quiet text-xs px-1.5 py-1">Remove last</button>
        )}
      </div>
    </Accordion>
  )
})

export default QuizEditor
