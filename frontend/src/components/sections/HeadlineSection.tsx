import React from "react"

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

export default function HeadlineSection({ content }: { content: string }) {
  return (
    <div className="px-6 pt-3 pb-5">
      <p className="text-[2rem] font-bold text-ink leading-tight">
        <WithCyanNumbers text={content} />
      </p>
    </div>
  )
}
