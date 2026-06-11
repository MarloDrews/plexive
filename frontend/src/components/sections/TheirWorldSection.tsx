import SectionLabel from "../SectionLabel"
interface Props {
  content: string
}

export default function TheirWorldSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">The World They Lived In</SectionLabel>
      <p className="prose-post text-ink-dim">{content}</p>
    </div>
  )
}
