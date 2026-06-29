import Prose from "../Prose"
import MathText from "../MathText"

interface Props {
  content: string
}

export default function ColdOpenSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <Prose className="text-ink font-medium"><MathText text={content} /></Prose>
    </div>
  )
}
