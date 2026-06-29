import Prose from "../Prose"
import MathText from "../MathText"

interface Props {
  content: string
}

// Books opening lead (REQUIRED): the orientation and the honest case for reading
// the book. A label-less lead paragraph in full ink, like the other opening
// sections (stories ColdOpen, EssenceSection), so the post opens on substance.
export default function WhyReadItSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <Prose className="text-ink"><MathText text={content} /></Prose>
    </div>
  )
}
