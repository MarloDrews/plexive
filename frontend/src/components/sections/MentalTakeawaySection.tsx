import SectionLabel from "../SectionLabel"
import SvgBlock from "../SvgBlock"

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
      <p className="prose-post">{content.body}</p>
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
