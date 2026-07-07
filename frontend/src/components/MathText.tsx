import { memo, useMemo } from "react"
import { splitItalics } from "@/lib/italics"
import { unescapeDollar } from "@/lib/prose"
import { useKatex } from "@/lib/katexLoader"

type Segment = { type: "text"; content: string } | { type: "math"; content: string }

// Finds the next "$" that is not backslash-escaped, so a literal "\$" (a
// currency dollar) is not mistaken for an inline-math delimiter.
function nextUnescapedDollar(text: string, from: number): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] === "\\") {
      j++ // skip the escaped character
      continue
    }
    if (text[j] === "$") return j
  }
  return -1
}

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = []
  let i = 0
  while (i < text.length) {
    const start = nextUnescapedDollar(text, i)
    if (start === -1) {
      if (i < text.length) segments.push({ type: "text", content: unescapeDollar(text.slice(i)) })
      break
    }
    if (start > i) segments.push({ type: "text", content: unescapeDollar(text.slice(i, start)) })
    const end = nextUnescapedDollar(text, start + 1)
    if (end === -1) {
      segments.push({ type: "text", content: unescapeDollar(text.slice(start)) })
      break
    }
    segments.push({ type: "math", content: text.slice(start + 1, end) })
    i = end + 1
  }
  return segments
}

interface Props {
  text: string
  className?: string
}

// Renders prose text that may contain inline $...$ LaTeX math. KaTeX loads
// lazily and only when a math segment actually exists, so plain prose never
// pays for the module; math shows its raw LaTeX as plain text until then.
// Parsing and katex.renderToString are memoized on the text (stable per post),
// and the component is memo-exported, so page-level re-renders (comment
// drafts, read-aloud status) never repeat LaTeX layout work.
function MathText({ text, className }: Props) {
  const segments = useMemo(() => parseSegments(text), [text])
  const katex = useKatex(segments.some((seg) => seg.type === "math"))

  const children = useMemo(
    () =>
      segments.map((seg, i) => {
        if (seg.type === "text")
          return (
            <span key={i}>
              {splitItalics(seg.content).map((run, j) =>
                run.italic ? <em key={j}>{run.text}</em> : <span key={j}>{run.text}</span>,
              )}
            </span>
          )
        if (!katex) return <span key={i}>{seg.content}</span>
        const html = (() => {
          try {
            return katex.renderToString(seg.content, { throwOnError: false, output: "html" })
          } catch {
            return seg.content
          }
        })()
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
      }),
    [segments, katex]
  )

  return <span className={className}>{children}</span>
}

export default memo(MathText)
