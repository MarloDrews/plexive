// Splits a plain-text run into alternating non-italic / italic pieces on
// asterisk pairs *...*. The asterisk is the only italic marker (underscore is
// reserved for LaTeX subscripts, e.g. a_{b} inside $...$). An unmatched
// trailing "*" stays literal. This runs only on the text segments produced by
// MathText, never on math, so it cannot touch LaTeX.
export type Run = { text: string; italic: boolean }

export function splitItalics(text: string): Run[] {
  const runs: Run[] = []
  // The delimited content must begin and end with a non-whitespace character, so
  // arithmetic like "3 * 4 * 5" is not read as italic " 4 " (the asterisks are
  // operators there, not emphasis markers).
  const re = /\*(\S(?:[^*]*\S)?)\*/g // shortest pair, no nested/empty, no space-adjacent
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
