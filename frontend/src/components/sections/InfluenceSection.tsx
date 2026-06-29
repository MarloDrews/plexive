import SectionLabel from "../SectionLabel"
import Prose from "../Prose"
import MathText from "../MathText"
interface Props {
  content: string
}

// Books Part 6 context (OPTIONAL): how the book was received and the mark it left.
// Muted secondary prose with a caps label, the same treatment as the other context
// sections (WorldContextSection, CritiqueSection).
export default function InfluenceSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">Reception and Influence</SectionLabel>
      <Prose className="text-ink-dim"><MathText text={content} /></Prose>
    </div>
  )
}
