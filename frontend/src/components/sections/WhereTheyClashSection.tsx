import SectionLabel from "../SectionLabel"

interface Props {
  content: string
}

export default function WhereTheyClashSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">Where They Clash</SectionLabel>
      <p className="prose-post text-ink-dim">{content}</p>
    </div>
  )
}
