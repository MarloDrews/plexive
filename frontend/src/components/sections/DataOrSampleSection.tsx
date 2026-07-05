import SectionLabel from "../SectionLabel"
import MathText from "../MathText"
import Prose from "../Prose"

interface Props {
  content: string
}

// Academy data_or_sample: the empirical material that grounds the claim. A prose
// string (datasets, subjects, criteria, power), with inline $...$ math allowed.
export default function DataOrSampleSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">Data and Sample</SectionLabel>
      <Prose className="text-ink-dim">
        <MathText text={content} />
      </Prose>
    </div>
  )
}
