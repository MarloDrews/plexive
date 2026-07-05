import SectionLabel from "../SectionLabel"
import SvgBlock from "../SvgBlock"
import Prose from "../Prose"
import MathText from "../MathText"

interface MentalTakeawayContent {
  body: string
  visual_svg?: string
}

interface Props {
  content: MentalTakeawayContent
  isUserContent: boolean
}

export default function MentalTakeawaySection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>Mental Takeaway</SectionLabel>
      <Prose><MathText text={content.body} /></Prose>
      {content.visual_svg && (
        <SvgBlock
          svg={content.visual_svg}
          isUserContent={isUserContent}
          className="w-full max-w-[400px] mx-auto mt-2"
        />
      )}
    </div>
  )
}
