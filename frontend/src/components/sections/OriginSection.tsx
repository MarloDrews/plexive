import SectionLabel from "../SectionLabel"
import ContentImage from "./ContentImage"
import Prose from "../Prose"
import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"

interface KeyThinker {
  name: string
  role: string
  one_line?: string
  lifespan?: string
  image_url?: string
  image_attribution?: string
  // Graph fields, not displayed: birth_year, featured.
}

interface OriginContent {
  body: string
  key_thinkers?: KeyThinker[]
  image_url?: string
  image_caption?: string
  image_attribution?: string
}

interface Props {
  content: OriginContent
}

export default function OriginSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>Origin</SectionLabel>
      <Prose className="text-ink-dim"><MathText text={content.body} /></Prose>

      {content.image_url && (
        <ContentImage
          url={content.image_url}
          caption={content.image_caption}
          attribution={content.image_attribution}
          className="w-full max-w-[360px] mx-auto mt-1"
        />
      )}

      {content.key_thinkers && content.key_thinkers.length > 0 && (
        <div className="flex flex-col gap-3">
          {/* Person cards, the shared key-figures kit (LAYOUT_STANDARD s7); same
              card shape as CastSection, with an optional portrait. */}
          {content.key_thinkers.map((thinker, i) => (
            <div key={i} className="border border-edge rounded-card px-4 py-3 flex flex-col gap-2">
              <div className="flex gap-3">
                {thinker.image_url && (
                  <img
                    src={thinker.image_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="shrink-0 w-12 h-12 rounded-full object-cover bg-white/[0.06]"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                  />
                )}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-ink">{unescapeDollar(thinker.name)}</span>
                    {thinker.lifespan && (
                      <span className="text-xs text-ink-muted">{unescapeDollar(thinker.lifespan)}</span>
                    )}
                  </div>
                  <p className="text-xs font-semibold tracking-widest uppercase text-(--accent)/80">{unescapeDollar(thinker.role)}</p>
                  {thinker.one_line && (
                    <p className="text-sm text-ink-dim leading-snug mt-1"><MathText text={thinker.one_line} /></p>
                  )}
                </div>
              </div>
              {thinker.image_url && thinker.image_attribution && (
                <p className="text-[10px] text-ink-faint leading-snug">{unescapeDollar(thinker.image_attribution)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
