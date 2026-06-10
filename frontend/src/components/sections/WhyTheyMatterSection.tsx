import SectionLabel from "../SectionLabel"
interface Props {
  content: string
}

export default function WhyTheyMatterSection({ content }: Props) {
  return (
    <div className="px-5 py-6">
      <SectionLabel className="mb-3">Why They Matter</SectionLabel>
      <p className="text-base text-zinc-300 leading-relaxed">{content}</p>
    </div>
  )
}
