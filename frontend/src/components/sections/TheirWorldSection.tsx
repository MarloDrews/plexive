import SectionLabel from "../SectionLabel"
interface Props {
  content: string
}

export default function TheirWorldSection({ content }: Props) {
  return (
    <div className="px-5 py-6">
      <SectionLabel className="mb-3">The World They Lived In</SectionLabel>
      <p className="text-sm text-zinc-400 leading-relaxed">{content}</p>
    </div>
  )
}
