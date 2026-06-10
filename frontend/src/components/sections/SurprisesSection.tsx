import SectionLabel from "../SectionLabel"
interface Props {
  content: string
}

export default function SurprisesSection({ content }: Props) {
  return (
    <div className="px-5 py-6 bg-cyan-950/20">
      <SectionLabel color="text-cyan-600" className="mb-3">Why It Surprises Us</SectionLabel>
      <p className="text-base text-zinc-200 leading-relaxed">{content}</p>
    </div>
  )
}
