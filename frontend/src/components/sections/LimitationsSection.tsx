import SectionLabel from "../SectionLabel"

interface Props {
  content: string
}

export default function LimitationsSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">Limitations</SectionLabel>
      <p className="prose-post text-ink-dim">{content}</p>
    </div>
  )
}
