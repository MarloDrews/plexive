// Maps character offsets in the combined string back to DOM Ranges and
// paints them with the CSS Custom Highlight API. The matching ::highlight()
// rules are injected at runtime by ensureHighlightStyles() below (they cannot
// live in globals.css: Lightning CSS, the build-time CSS transformer, rejects
// the ::highlight() pseudo-element and fails the whole file). Browsers without
// the API silently skip the visuals; speaking never depends on this file.

import type { TextSegment } from "./extractText"

export const SENTENCE_HIGHLIGHT = "read-aloud-sentence"
export const WORD_HIGHLIGHT = "read-aloud-word"

const HIGHLIGHT_STYLE_ID = "read-aloud-highlights"

// The ::highlight() styling, reproduced verbatim from the old globals.css rules:
// the sentence is a soft wash of the post's format accent (var(--accent), which
// resolves against the highlighted text's element), the spoken word a stronger
// step of the same accent. Kept out of globals.css so the static parser never
// sees ::highlight(); injected once, client-side, before the first paint.
const HIGHLIGHT_CSS = `::highlight(read-aloud-sentence) {
  background-color: color-mix(in srgb, var(--accent) 18%, transparent);
}
::highlight(read-aloud-word) {
  background-color: color-mix(in srgb, var(--accent) 45%, transparent);
  color: var(--color-ink);
}`

function highlightsSupported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS
}

// Inject the ::highlight() rules into <head> once. Idempotent (id-guarded) and
// client-only; called from setHighlight so it runs only where highlights paint.
function ensureHighlightStyles() {
  if (typeof document === "undefined") return
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return
  const style = document.createElement("style")
  style.id = HIGHLIGHT_STYLE_ID
  style.textContent = HIGHLIGHT_CSS
  document.head.appendChild(style)
}

// Finds the Text nodes covering [start, end) of the combined string and
// builds a Range across them. Unmapped separator characters between
// segments fall away naturally.
export function rangeFromOffsets(
  segments: TextSegment[],
  start: number,
  end: number
): Range | null {
  let startNode: Text | null = null
  let startOffset = 0
  let endNode: Text | null = null
  let endOffset = 0

  for (const seg of segments) {
    if (seg.end <= start) continue
    if (seg.start >= end) break
    if (!startNode) {
      startNode = seg.node
      startOffset = Math.max(0, start - seg.start)
    }
    endNode = seg.node
    endOffset = Math.min(end, seg.end) - seg.start
  }

  if (!startNode || !endNode) return null
  try {
    const range = document.createRange()
    // Clamp to the node's current length and guard setStart/setEnd: the Text
    // nodes were captured at start(), and a re-render (comment count, like) can
    // shrink or replace one, which would throw IndexSizeError and kill playback.
    range.setStart(startNode, Math.min(startOffset, startNode.length))
    range.setEnd(endNode, Math.min(endOffset, endNode.length))
    return range
  } catch {
    return null
  }
}

export function setHighlight(name: string, range: Range | null) {
  if (!highlightsSupported()) return
  ensureHighlightStyles()
  if (range) CSS.highlights.set(name, new Highlight(range))
  else CSS.highlights.delete(name)
}

export function clearHighlights() {
  if (!highlightsSupported()) return
  CSS.highlights.delete(SENTENCE_HIGHLIGHT)
  CSS.highlights.delete(WORD_HIGHLIGHT)
}
