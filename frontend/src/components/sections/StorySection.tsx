import SectionLabel from "../SectionLabel"
import type { StoryContent } from "../../types/post"
import AppImage from "../AppImage"
import SvgBlock from "../SvgBlock"
import ContentImage from "./ContentImage"
import Prose from "../Prose"
import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"

interface Props {
  content: StoryContent
  isUserContent: boolean
}

export default function StorySection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-5">
      <SectionLabel>The Story Behind It</SectionLabel>
      <Prose><MathText text={content.body} /></Prose>

      {content.visual_svg && (
        <div className="w-full max-w-[360px] mx-auto bg-transparent">
          <SvgBlock svg={content.visual_svg} isUserContent={isUserContent} />
        </div>
      )}
      {content.image_url && !content.visual_svg && (
        <ContentImage
          url={content.image_url}
          caption={content.image_caption}
          attribution={content.image_attribution}
        />
      )}

      {content.key_figures && content.key_figures.length > 0 && (
        <div className="flex flex-col gap-3 mt-1">
          {content.key_figures.map((fig, i) => (
            <div key={i} className="bg-surface-2 border border-edge-strong rounded-field px-4 py-4 flex gap-3 items-start">
              {fig.image_url && (
                <AppImage
                  src={fig.image_url}
                  // Decision 12: the name renders right beside the portrait, so
                  // an alt would read it twice.
                  alt=""
                  width={40}
                  height={40}
                  sizes="40px"
                  className="w-10 h-10 rounded-full object-cover shrink-0 bg-surface-2"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                />
              )}
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-ink">{unescapeDollar(fig.name)}</span>
                  {fig.lifespan && (
                    <span className="text-xs text-ink-muted">{unescapeDollar(fig.lifespan)}</span>
                  )}
                </div>
                <span className="text-xs text-(--accent)/70">{unescapeDollar(fig.role)}</span>
                {fig.one_line && (
                  <p className="text-sm text-ink-body leading-relaxed mt-1"><MathText text={fig.one_line} /></p>
                )}
                {fig.image_url && fig.image_attribution && (
                  <p className="text-[10px] text-ink-faint leading-snug mt-1">{unescapeDollar(fig.image_attribution)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
