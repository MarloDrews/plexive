import katex from "katex"
import { splitItalics } from "@/lib/italics"
import { unescapeDollar } from "@/lib/prose"

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

// Renders prose text that may contain inline $...$ LaTeX math.
export default function MathText({ text, className }: Props) {
  const segments = parseSegments(text)

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.type === "text")
          return (
            <span key={i}>
              {splitItalics(seg.content).map((run, j) =>
                run.italic ? <em key={j}>{run.text}</em> : <span key={j}>{run.text}</span>,
              )}
            </span>
          )
        const html = (() => {
          try {
            return katex.renderToString(seg.content, { throwOnError: false, output: "html" })
          } catch {
            return seg.content
          }
        })()
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
      })}
    </span>
  )
}
