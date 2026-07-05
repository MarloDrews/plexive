// Splits a plain-text run into alternating non-italic / italic pieces on
// asterisk pairs *...*. The asterisk is the only italic marker (underscore is
// reserved for LaTeX subscripts, e.g. a_{b} inside $...$). An unmatched
// trailing "*" stays literal. This runs only on the text segments produced by
// MathText, never on math, so it cannot touch LaTeX.
export type Run = { text: string; italic: boolean }

export function splitItalics(text: string): Run[] {
  const runs: Run[] = []
  const re = /\*([^*]+)\*/g // shortest pair, no nested or empty *
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), italic: false })
    runs.push({ text: m[1], italic: true })
    last = re.lastIndex
  }
  if (last < text.length) runs.push({ text: text.slice(last), italic: false })
  return runs
}
