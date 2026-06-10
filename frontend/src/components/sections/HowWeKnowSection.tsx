import SectionLabel from "../SectionLabel"
interface Props {
  content: string
}

export default function HowWeKnowSection({ content }: Props) {
  return (
    <div className="px-5 py-6">
      <SectionLabel className="mb-3">How We Know</SectionLabel>
      <p className="text-base text-zinc-300 leading-relaxed">{content}</p>
    </div>
  )
}
