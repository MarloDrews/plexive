import SectionLabel from "../SectionLabel"
import { safeImageSrc } from "@/lib/safeUrl"
interface GreatestWorkContent {
  title: string
  body: string
  visual_svg?: string
  image_url?: string
  image_caption?: string
  image_attribution?: string
}

import SvgBlock from "../SvgBlock"
import Prose from "../Prose"
import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"

interface Props {
  content: GreatestWorkContent
  isUserContent: boolean
}

export default function GreatestWorkSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-3">
      <SectionLabel>Their Greatest Work</SectionLabel>
      <h2 className="text-lg font-semibold text-(--accent) leading-snug">{unescapeDollar(content.title)}</h2>
      <Prose><MathText text={content.body} /></Prose>

      {content.visual_svg && (
        <SvgBlock svg={content.visual_svg} isUserContent={isUserContent} className="w-full max-w-[400px] mx-auto my-4" />
      )}

      {content.image_url && (
        <div className="flex flex-col mt-2">
          <img
            src={safeImageSrc(content.image_url)}
            alt=""
            loading="lazy"
            className="w-full rounded-lg object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
          />
          {content.image_caption && (
            <p className="text-xs text-ink-muted mt-2"><MathText text={content.image_caption} /></p>
          )}
          {content.image_attribution && (
            <p className="text-xs text-ink-faint mt-0.5">{unescapeDollar(content.image_attribution)}</p>
          )}
        </div>
      )}
    </div>
  )
}
