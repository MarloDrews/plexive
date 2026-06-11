import type { HeadlineFigureContent } from "../../types/post"
import SvgBlock from "../SvgBlock"
import MathText from "../MathText"

interface Props {
  content: HeadlineFigureContent
  isUserContent: boolean
}

export default function HeadlineFigureSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-3">
      {content.visual_svg && (
        <div className="w-full max-w-[360px] mx-auto">
          <SvgBlock svg={content.visual_svg} isUserContent={isUserContent} />
        </div>
      )}
      {content.image_url && !content.visual_svg && (
        <div className="w-full max-w-[360px] mx-auto">
          <img src={content.image_url} alt="" loading="lazy" decoding="async" className="w-full rounded-lg object-cover" />
        </div>
      )}
      {content.image_caption && (
        <p className="text-xs text-ink-muted text-center leading-relaxed">
          <MathText text={content.image_caption} />
        </p>
      )}
    </div>
  )
}
