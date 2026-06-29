import Prose from "../Prose"
import MathText from "../MathText"

interface Props {
  content: string
}

export default function WhyEnduresSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <div className="border-l-2 border-(--accent) pl-4">
        <Prose><MathText text={content} /></Prose>
      </div>
    </div>
  )
}
