import SectionLabel from "../SectionLabel"
import type { TangibleContent } from "../../types/post"
import SvgBlock from "../SvgBlock"
import MathText from "../MathText"

interface Props {
  content: TangibleContent
  isUserContent: boolean
}

export default function TangibleSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-4">Make It Tangible</SectionLabel>
      <ul className="flex flex-col gap-3">
        {content.items.map((line, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="text-(--accent) text-sm mt-0.5 shrink-0">•</span>
            <span className="prose-post"><MathText text={line} /></span>
          </li>
        ))}
      </ul>
      {content.visual_svg && (
        <div className="w-full max-w-[360px] mx-auto bg-transparent mt-4">
          <SvgBlock svg={content.visual_svg} isUserContent={isUserContent} />
        </div>
      )}
    </div>
  )
}
