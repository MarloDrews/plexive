import SectionLabel from "../SectionLabel"
import type { CastMember } from "../../types/post"
import MathText from "../MathText"
import { safeImageSrc } from "@/lib/safeUrl"
import { unescapeDollar } from "@/lib/prose"
import { asArray } from "@/lib/asArray"

interface Props {
  content: CastMember[]
}

export default function CastSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>The Cast</SectionLabel>
      <div className="flex flex-col gap-3">
        {/* Person cards, the shared key-figures kit (LAYOUT_STANDARD s7); same
            card shape as OriginSection's key thinkers, with an optional portrait
            and its required credit (IMAGE_STANDARD s3). */}
        {asArray(content).map((member, i) => (
          <div key={i} className="border border-edge rounded-card px-4 py-3 flex flex-col gap-2">
            <div className="flex gap-3">
              {member.image_url && (
                <img
                  src={safeImageSrc(member.image_url)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="shrink-0 w-12 h-12 rounded-full object-cover bg-white/[0.06]"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                />
              )}
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-ink">{unescapeDollar(member.name)}</span>
                  {member.lifespan && (
                    <span className="text-xs text-ink-muted">{unescapeDollar(member.lifespan)}</span>
                  )}
                </div>
                <p className="text-xs font-semibold tracking-widest uppercase text-(--accent)/80">{unescapeDollar(member.role)}</p>
                {member.one_line && (
                  <p className="text-sm text-ink-dim leading-snug mt-1"><MathText text={member.one_line} /></p>
                )}
              </div>
            </div>
            {member.image_url && member.image_attribution && (
              <p className="text-[10px] text-ink-muted leading-snug">{unescapeDollar(member.image_attribution)}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
