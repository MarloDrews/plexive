"use client"

import { memo } from "react"
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
  return (
    <Accordion title="Author Context">
      <textarea value={value.body} onChange={(e) => onChange({ ...value, body: e.target.value })} rows={3} placeholder="About the author..." className={`${inputCls} resize-none mb-2`} />
      <label className="text-ink-faint text-xs mb-1 block">Wikipedia URL</label>
      <input type="url" value={value.wikipedia_url} onChange={(e) => onChange({ ...value, wikipedia_url: e.target.value })} placeholder="https://en.wikipedia.org/wiki/..." className={inputCls} />
    </Accordion>
  )
})

export default AuthorContextEditor
