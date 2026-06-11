import SectionLabel from "../SectionLabel"

interface Props {
  content: string
}

export default function WhereTheDebateStandsSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">Where the Debate Stands</SectionLabel>
      <p className="prose-post text-ink-dim">{content}</p>
    </div>
  )
}
