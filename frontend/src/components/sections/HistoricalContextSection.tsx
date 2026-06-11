import SectionLabel from "../SectionLabel"

interface Props {
  content: string
}

export default function HistoricalContextSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">Historical Context</SectionLabel>
      <p className="prose-post text-ink-dim">{content}</p>
    </div>
  )
}
