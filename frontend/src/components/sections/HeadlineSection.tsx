import React from "react"
import { unescapeDollar } from "@/lib/prose"

function WithCyanNumbers({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  const PATTERN = /(\d[\d,\.]*(?:\s*(?:billion|million|trillion|thousand))?)/gi
  let last = 0
  let match: RegExpExecArray | null
  while ((match = PATTERN.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    // whitespace-nowrap keeps a multi-word accent unit (e.g. "1 billion") whole:
    // it never splits across a line wrap, moving to the next line together instead.
    parts.push(<span key={match.index} className="text-(--accent) whitespace-nowrap">{match[0]}</span>)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

// accentNumbers (default true) colors numeric units in the headline (the accent
// unit, LAYOUT_STANDARD s6) — right for a Facts headline whose claim IS a number.
// Academy passes false: a number in a paper title (a year, a model size) is
// incidental, not a designated emphasis, so the title renders with no accent.
//
// as: the detail page passes "h1" because the headline IS the page title there.
// It defaults to "p" so a "headline" body section rendered through
// SectionRenderer never becomes a second h1. Styling is identical either way.
export default function HeadlineSection({
  content,
  accentNumbers = true,
  as: Tag = "p",
}: {
  content: string
  accentNumbers?: boolean
  as?: "h1" | "p"
}) {
  return (
    <div className="px-6 pt-3 pb-5">
      <Tag className="font-serif text-headline font-medium tracking-tight text-ink leading-snug max-w-[24ch]">
        {accentNumbers ? <WithCyanNumbers text={unescapeDollar(content)} /> : unescapeDollar(content)}
      </Tag>
    </div>
  )
}
