import SectionLabel from "../SectionLabel"

interface NearbyConceptItem {
  concept: string
  distinction: string
}

interface Props {
  content: NearbyConceptItem[]
}

export default function NearbyConceptsSection({ content }: Props) {
  return (
    <div className="px-5 py-6 flex flex-col gap-4">
      <SectionLabel>Nearby Concepts</SectionLabel>
      <div className="flex flex-col gap-4">
        {content.map((item, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-violet-400">{item.concept}</span>
            <p className="text-sm text-zinc-400 leading-relaxed">{item.distinction}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
