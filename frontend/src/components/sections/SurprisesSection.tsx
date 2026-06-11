import SectionLabel from "../SectionLabel"
interface Props {
  content: string
}

export default function SurprisesSection({ content }: Props) {
  return (
    <div className="px-6 py-8 bg-(--accent)/20">
      <SectionLabel color="text-(--accent)/70" className="mb-3">Why It Surprises Us</SectionLabel>
      <p className="text-base text-ink leading-relaxed">{content}</p>
    </div>
  )
}
