import SectionLabel from "../SectionLabel"
import Prose from "../Prose"
import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"

interface NearbyConceptItem {
  concept: string
  distinction: string
}

interface Props {
  content: NearbyConceptItem[]
}

export default function NearbyConceptsSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>Nearby Concepts</SectionLabel>
      <div className="flex flex-col gap-4">
        {content.map((item, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-(--accent)">{unescapeDollar(item.concept)}</span>
            <Prose className="text-ink-dim"><MathText text={item.distinction} /></Prose>
          </div>
        ))}
      </div>
    </div>
  )
}
