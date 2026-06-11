import SectionLabel from "../SectionLabel"
interface Props {
  content: string
}

export default function WhyTheyMatterSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">Why They Matter</SectionLabel>
      <p className="prose-post">{content}</p>
    </div>
  )
}
