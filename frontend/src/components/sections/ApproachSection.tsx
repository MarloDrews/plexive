import SectionLabel from "../SectionLabel"
import type { ApproachContent } from "../../types/post"
import SvgBlock from "../SvgBlock"
import MathText from "../MathText"

interface Props {
  content: ApproachContent
  isUserContent: boolean
}

export default function ApproachSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>Approach</SectionLabel>
      <p className="prose-post text-ink-dim">
        <MathText text={content.body} />
      </p>
      {content.visual_svg && (
        <div className="w-full max-w-[360px] mx-auto mt-1">
          <SvgBlock svg={content.visual_svg} isUserContent={isUserContent} />
        </div>
      )}
    </div>
  )
}
