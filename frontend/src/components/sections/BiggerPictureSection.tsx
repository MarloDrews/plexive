import SectionLabel from "../SectionLabel"
import Prose from "../Prose"
import MathText from "../MathText"
interface Props {
  content: string
}

export default function BiggerPictureSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">The Bigger Picture</SectionLabel>
      <Prose className="text-ink font-medium"><MathText text={content} /></Prose>
    </div>
  )
}
