import type { HeadlineFigureContent } from "../../types/post"
import AppImage from "../AppImage"
import SvgBlock from "../SvgBlock"
import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"

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
          <AppImage
            src={content.image_url}
            alt=""
            width={860}
            height={645}
            sizes="(max-width: 430px) 100vw, 430px"
            className="w-full rounded-lg object-cover"
            onError={(e) => {
              // Hide the whole figure block (image + spacer) like ContentImage.
              const wrap = (e.currentTarget as HTMLImageElement).parentElement
              if (wrap) wrap.style.display = "none"
            }}
          />
        </div>
      )}
      {content.image_caption && (
        <p className="text-xs text-ink-muted text-center leading-relaxed">
          <MathText text={content.image_caption} />
        </p>
      )}
      {/* Attribution is required for a sourced figure (IMAGE_STANDARD); a
          self-built SVG carries none. */}
      {content.image_url && !content.visual_svg && content.image_attribution && (
        <p className="text-[10px] text-ink-faint text-center leading-snug">
          {unescapeDollar(content.image_attribution)}
        </p>
      )}
    </div>
  )
}
