import SectionLabel from "../SectionLabel"
import type { SeeItContent } from "../../types/post"
import SvgBlock from "../SvgBlock"

interface Props {
  content: SeeItContent
  isUserContent: boolean
}

export default function SeeItSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-3">
      <SectionLabel>See It</SectionLabel>
      {content.visual_svg && (
        <div className="w-full max-w-[360px] mx-auto bg-transparent">
          <SvgBlock svg={content.visual_svg} isUserContent={isUserContent} />
        </div>
      )}
      {content.image_url && !content.visual_svg && (
        <div className="w-full max-w-[360px] mx-auto">
          <img src={content.image_url} alt="" loading="lazy" decoding="async" className="w-full rounded-lg object-cover" />
        </div>
      )}
      {content.image_caption && (
        <p className="text-xs text-ink-muted text-center leading-relaxed">{content.image_caption}</p>
      )}
      {content.image_attribution && (
        <p className="text-[10px] text-ink-faint text-center">{content.image_attribution}</p>
      )}
    </div>
  )
}
