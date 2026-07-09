"use client"

import { memo, useId } from "react"
import { Accordion, inputCls } from "./formUi"

export const emptyAuthorContext = () => ({
  body: "",
  image_url: "",
  image_attribution: "",
  wikipedia_url: "",
})
export type AuthorContextState = ReturnType<typeof emptyAuthorContext>

// Memoized Author Context section (Books, optional).
const AuthorContextEditor = memo(function AuthorContextEditor({
  value,
  onChange,
}: {
  value: AuthorContextState
  onChange: (value: AuthorContextState) => void
}) {
  const uid = useId()
  return (
    <Accordion title="Author Context">
      <textarea aria-label="About the author" value={value.body} onChange={(e) => onChange({ ...value, body: e.target.value })} rows={3} placeholder="About the author..." className={`${inputCls} resize-none mb-2`} />
      <label htmlFor={`${uid}-wikipedia`} className="text-ink-muted text-xs mb-1 block">Wikipedia URL</label>
      <input id={`${uid}-wikipedia`} type="url" value={value.wikipedia_url} onChange={(e) => onChange({ ...value, wikipedia_url: e.target.value })} placeholder="https://en.wikipedia.org/wiki/..." className={inputCls} />
    </Accordion>
  )
})

export default AuthorContextEditor
