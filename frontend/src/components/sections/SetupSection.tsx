import SectionLabel from "../SectionLabel"

interface Props {
  content: string
}

export default function SetupSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">Setup</SectionLabel>
      <p className="prose-post text-ink-dim">{content}</p>
    </div>
  )
}
