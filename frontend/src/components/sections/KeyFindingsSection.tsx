import SectionLabel from "../SectionLabel"
import type { KeyFindingItem } from "../../types/post"
import SvgBlock from "../SvgBlock"
import MathText from "../MathText"

interface Props {
  content: KeyFindingItem[]
  isUserContent: boolean
}

export default function KeyFindingsSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-5">
      <SectionLabel>Key Findings</SectionLabel>
      {content.map((item, i) => (
        <div key={i} className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">{item.title}</p>
          <p className="prose-post text-ink-dim">
            <MathText text={item.finding} />
          </p>
          {item.visual_svg && (
            <div className="w-full max-w-[360px] mx-auto mt-1">
              <SvgBlock svg={item.visual_svg} isUserContent={isUserContent} />
            </div>
          )}
          {item.source_in_paper && (
            <p className="text-xs text-ink-faint">Source: {item.source_in_paper}</p>
          )}
        </div>
      ))}
    </div>
  )
}
