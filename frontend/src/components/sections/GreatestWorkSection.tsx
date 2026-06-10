import SectionLabel from "../SectionLabel"
interface GreatestWorkContent {
  title: string
  body: string
  visual_svg?: string
  image_url?: string
  image_caption?: string
  image_attribution?: string
}

import SvgBlock from "../SvgBlock"

interface Props {
  content: GreatestWorkContent
  isUserContent: boolean
}

export default function GreatestWorkSection({ content, isUserContent }: Props) {
  return (
    <div className="px-5 py-6 flex flex-col gap-3">
      <SectionLabel>Greatest Work</SectionLabel>
      <h2 className="text-lg font-semibold text-rose-400 leading-snug">{content.title}</h2>
      <p className="text-base text-zinc-300 leading-relaxed">{content.body}</p>

      {content.visual_svg && (
        <SvgBlock svg={content.visual_svg} isUserContent={isUserContent} className="w-full max-w-[400px] mx-auto my-4" />
      )}

      {content.image_url && (
        <div className="flex flex-col mt-2">
          <img
            src={content.image_url}
            alt=""
            loading="lazy"
            className="w-full rounded-lg object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
          />
          {content.image_caption && (
            <p className="text-xs text-zinc-500 mt-2">{content.image_caption}</p>
          )}
        </div>
      )}
    </div>
  )
}
