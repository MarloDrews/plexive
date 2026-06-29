import SectionLabel from "../SectionLabel"
import MathText from "../MathText"
import Prose from "../Prose"

interface Props {
  content: string
}

export default function RobustnessSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">Robustness</SectionLabel>
      <Prose className="text-ink-dim">
        <MathText text={content} />
      </Prose>
    </div>
  )
}
