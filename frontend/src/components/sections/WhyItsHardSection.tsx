import SectionLabel from "../SectionLabel"
import Prose from "../Prose"
import MathText from "../MathText"

interface Props {
  content: string
}

export default function WhyItsHardSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">Why It&apos;s Hard</SectionLabel>
      <Prose className="text-ink-dim"><MathText text={content} /></Prose>
    </div>
  )
}
