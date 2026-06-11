import SectionLabel from "../SectionLabel"
import SvgBlock from "../SvgBlock"
import type { TheAftermathContent } from "../../types/post"

interface Props {
  content: TheAftermathContent
  isUserContent: boolean
}

export default function TheAftermathSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>The Aftermath</SectionLabel>
      <p className="prose-post">{content.body}</p>
      {content.visual_svg && (
        <div className="flex flex-col gap-1">
          <SvgBlock
            svg={content.visual_svg}
            isUserContent={isUserContent}
            className="w-full max-w-[400px] mx-auto"
          />
          {content.image_caption && (
            <p className="text-xs text-ink-muted text-center leading-snug">{content.image_caption}</p>
          )}
        </div>
      )}
    </div>
  )
}
