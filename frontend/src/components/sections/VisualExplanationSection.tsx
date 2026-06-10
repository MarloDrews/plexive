import SectionLabel from "../SectionLabel"
import SvgBlock from "../SvgBlock"

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
    <div className="px-5 py-6 flex flex-col gap-3">
      <SectionLabel>Visual Explanation</SectionLabel>
      <SvgBlock
        svg={content.visual_svg}
        isUserContent={isUserContent}
        className="w-full max-w-[400px] mx-auto"
      />
      {content.image_caption && (
        <p className="text-xs text-zinc-500 text-center leading-snug">{content.image_caption}</p>
      )}
    </div>
  )
}
