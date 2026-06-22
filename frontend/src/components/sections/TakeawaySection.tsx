import type { TakeawayContent } from "../../types/post"
import SvgBlock from "../SvgBlock"
import SectionLabel from "../SectionLabel"

interface Props {
  content: TakeawayContent
  isUserContent: boolean
}

// The Books closing kernel (REQUIRED). Plain shared section treatment, like every
// other prose section: the accent caps heading then prose body. No filled block, no
// bold, no border (heart is the one accent-bordered key section, LAYOUT_STANDARD s7).
// The framing field (framework | question) no longer changes the rendering.
export default function TakeawaySection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">What Stays With You</SectionLabel>
      <p className="prose-post">{content.body}</p>
      {content.visual_svg && (
        <SvgBlock svg={content.visual_svg} isUserContent={isUserContent} className="w-full max-w-[360px] mx-auto mt-4" />
      )}
    </div>
  )
}
