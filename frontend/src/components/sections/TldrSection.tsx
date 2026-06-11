import SectionLabel from "../SectionLabel"
import MathText from "../MathText"

interface Props {
  content: string
}

export default function TldrSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">TL;DR</SectionLabel>
      <p className="prose-post">
        <MathText text={content} />
      </p>
    </div>
  )
}
