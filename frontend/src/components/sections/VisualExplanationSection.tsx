import SectionLabel from "../SectionLabel"
import SvgBlock from "../SvgBlock"
import MathText from "../MathText"

interface VisualExplanationContent {
  visual_svg: string
  image_caption?: string
}

interface Props {
  content: VisualExplanationContent
  isUserContent: boolean
}

export default function VisualExplanationSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-3">
      <SectionLabel>Visual Explanation</SectionLabel>
      {content.visual_svg && (
        <SvgBlock
          svg={content.visual_svg}
          isUserContent={isUserContent}
          className="w-full max-w-[400px] mx-auto"
        />
      )}
      {content.image_caption && (
        <p className="text-xs text-ink-muted text-center leading-snug"><MathText text={content.image_caption} /></p>
      )}
    </div>
  )
}
