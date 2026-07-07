import SectionLabel from "../SectionLabel"
interface Episode {
  title: string
  year_or_period: string
  body: string
  image_url?: string
  image_caption?: string
  image_attribution?: string
  visual_svg?: string
  location?: string
}

import SvgBlock from "../SvgBlock"
import Prose from "../Prose"
import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"
import { asArray } from "@/lib/asArray"

interface Props {
  content: Episode[]
  isUserContent: boolean
}

export default function DefiningMomentsSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-10">
      <SectionLabel className="-mb-4">Defining Moments</SectionLabel>
      {asArray(content).map((episode, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs font-mono text-(--accent) shrink-0">{unescapeDollar(episode.year_or_period)}</span>
            {episode.location && (
              <span className="text-xs text-ink-faint">{unescapeDollar(episode.location)}</span>
            )}
          </div>
          <h4 className="text-lg font-semibold text-ink leading-snug">{unescapeDollar(episode.title)}</h4>
          <Prose><MathText text={episode.body} /></Prose>

          {episode.visual_svg && episode.visual_svg.length > 0 && (
            <SvgBlock svg={episode.visual_svg} isUserContent={isUserContent} className="w-full max-w-[400px] mx-auto my-3" />
          )}

          {episode.image_url && (
            <div className="flex flex-col">
              <img
                src={episode.image_url}
                alt=""
                loading="lazy"
                className="w-full rounded-lg object-cover max-h-[280px]"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
              />
              {episode.image_caption && (
                <p className="text-xs text-ink-muted mt-2 leading-snug"><MathText text={episode.image_caption} /></p>
              )}
              {episode.image_attribution && (
                <p className="text-xs text-ink-faint mt-0.5">{unescapeDollar(episode.image_attribution)}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
