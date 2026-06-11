import SectionLabel from "../SectionLabel"
interface Props {
  content: string
}

export default function HowWeKnowSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">How We Know</SectionLabel>
      <p className="prose-post">{content}</p>
    </div>
  )
}
