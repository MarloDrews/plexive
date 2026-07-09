import { useEffect, useState } from "react"
import type katexType from "katex"

// Lazy KaTeX loader. katex.min.js is ~271 KB minified and used only by posts
// that actually contain math, so it must never sit in a route's eager chunk;
// the CSS rides in the same lazy chunk (it was previously imported globally in
// the root layout). One module-level promise means the pair loads at most once
// per session, and math waits for both so it never renders unstyled.
type Katex = typeof katexType

let katexModule: Katex | null = null
let katexPromise: Promise<Katex> | null = null

export function loadKatex(): Promise<Katex> {
  if (!katexPromise) {
    katexPromise = Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(
      ([m]) => {
        katexModule = m.default
        return m.default
      }
    )
  }
  return katexPromise
}

// Returns the katex module once loaded, or null while it is still on its way
// (callers render a plain-text fallback until then). `needed` gates the
// download: text without math never triggers it.
export function useKatex(needed: boolean): Katex | null {
  const [katex, setKatex] = useState<Katex | null>(katexModule)
  useEffect(() => {
    if (!needed || katex) return
    let alive = true
    loadKatex().then((k) => {
      if (alive) setKatex(k)
    })
    return () => {
      alive = false
    }
  }, [needed, katex])
  return needed ? katex : null
}
