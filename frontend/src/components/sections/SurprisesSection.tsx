import SectionLabel from "../SectionLabel"
import MathText from "../MathText"
interface Props {
  content: string
}

export default function SurprisesSection({ content }: Props) {
  return (
    <div className="px-6 py-8 border-l-2 border-(--accent) bg-(--accent)/[0.06]">
      <SectionLabel className="mb-3">Why It Surprises Us</SectionLabel>
      <p className="text-base text-ink leading-relaxed"><MathText text={content} /></p>
    </div>
  )
}
