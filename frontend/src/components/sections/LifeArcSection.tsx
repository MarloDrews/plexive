import SectionLabel from "../SectionLabel"
interface Milestone {
  year: string
  label: string
}

interface LifeArcContent {
  visual_svg: string
  milestones: Milestone[]
}

import SvgBlock from "../SvgBlock"

interface Props {
  content: LifeArcContent
  isUserContent: boolean
}

export default function LifeArcSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-4">Life Arc</SectionLabel>
      {content.visual_svg && (
        <SvgBlock svg={content.visual_svg} isUserContent={isUserContent} className="w-full max-w-[400px] mx-auto my-2" />
      )}
      <ol className="mt-4 flex flex-col gap-2">
        {content.milestones.map((m, i) => (
          <li key={i} className="flex gap-3 items-baseline">
            <span className="text-xs font-mono text-(--accent) shrink-0 w-10">{m.year}</span>
            <span className="text-sm text-ink-dim">{m.label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
