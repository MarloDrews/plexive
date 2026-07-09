import type { CoreIdeaItem } from "../../types/post"
import SvgBlock from "../SvgBlock"
import SectionLabel from "../SectionLabel"
import Prose from "../Prose"
import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"
import { asArray } from "@/lib/asArray"
import { sizedImageUrl } from "@/lib/imageUrl"

interface Props {
  content: CoreIdeaItem[]
  isUserContent: boolean
}

export default function CoreIdeasSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-4">The Core Ideas</SectionLabel>
      <div className="flex flex-col gap-10">
      {asArray(content).map((idea, i) => (
        <div key={i} className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-(--accent) leading-snug">{unescapeDollar(idea.title)}</h3>
          <Prose><MathText text={idea.body} /></Prose>

          {idea.visual_svg && (
            <SvgBlock svg={idea.visual_svg} isUserContent={isUserContent} className="w-full max-w-[360px] mx-auto my-4" />
          )}

          {idea.image_url && (
            <div className="max-w-[360px] mx-auto my-2">
              {/* Plain img on purpose: unknown intrinsic ratio, so a nominal
                  next/image size painted a dark placeholder before load. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sizedImageUrl(idea.image_url, 720)}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full rounded-lg object-cover"
                onError={(e) => {
                  // Hide the whole figure block (image + caption) like ContentImage.
                  const wrap = (e.currentTarget as HTMLImageElement).parentElement
                  if (wrap) wrap.style.display = "none"
                }}
              />
              {/* Caption is optional; the credit line is required with every
                  sourced image and renders independently of it (IMAGE_STANDARD
                  s3-s4), the same treatment as PortraitSection. */}
              {(idea.image_caption || idea.image_attribution) && (
                <div className="pt-2">
                  {idea.image_caption && (
                    <p className="text-sm text-ink-dim leading-snug"><MathText text={idea.image_caption} /></p>
                  )}
                  {idea.image_attribution && (
                    <p className="text-xs text-ink-muted mt-1">{unescapeDollar(idea.image_attribution)}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {idea.quote && (
            <blockquote className="border-l-2 border-edge-strong pl-4 my-2">
              <p className="text-base italic text-ink-dim leading-relaxed">&ldquo;{unescapeDollar(idea.quote)}&rdquo;</p>
            </blockquote>
          )}

          {idea.in_practice && (
            <div className="bg-(--accent)/10 rounded-lg px-4 py-3">
              <p data-no-read className="label-caps text-(--accent) mb-1.5">In practice</p>
              <p className="text-sm text-ink leading-relaxed"><MathText text={idea.in_practice} /></p>
            </div>
          )}
        </div>
      ))}
      </div>
    </div>
  )
}
