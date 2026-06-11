import SectionLabel from "../SectionLabel"

interface Props {
  content: string
}

export default function RobustnessSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">Robustness</SectionLabel>
      <p className="prose-post text-ink-dim">{content}</p>
    </div>
  )
}
