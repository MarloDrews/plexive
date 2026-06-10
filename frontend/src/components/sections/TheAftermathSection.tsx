import SectionLabel from "../SectionLabel"
import SvgBlock from "../SvgBlock"
import type { TheAftermathContent } from "../../types/post"

interface Props {
  content: TheAftermathContent
  isUserContent: boolean
}

export default function TheAftermathSection({ content, isUserContent }: Props) {
  return (
    <div className="px-5 py-6 flex flex-col gap-4">
      <SectionLabel>The Aftermath</SectionLabel>
      <p className="text-sm text-zinc-300 leading-relaxed">{content.body}</p>
      {content.visual_svg && (
        <div className="flex flex-col gap-1">
          <SvgBlock
            svg={content.visual_svg}
            isUserContent={isUserContent}
            className="w-full max-w-[400px] mx-auto"
          />
          {content.image_caption && (
            <p className="text-xs text-zinc-500 text-center leading-snug">{content.image_caption}</p>
          )}
        </div>
      )}
    </div>
  )
}
