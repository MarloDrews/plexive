import SectionLabel from "../SectionLabel"
import MathText from "../MathText"
import type { AuthorsContextItem } from "../../types/post"
import { safeImageSrc } from "@/lib/safeUrl"
import { unescapeDollar } from "@/lib/prose"
import { asArray } from "@/lib/asArray"

interface Props {
  content: AuthorsContextItem[]
}

// Academy authors_context: the format's person-list, rendered as person cards in
// the shared key-figures look (same card shape as CastSection / OriginSection):
// an optional round portrait with its required credit (IMAGE_STANDARD s3), the
// name, the role kicker, the one-line note and the affiliation. This is also
// where the post's person edges live (resolved server-side), not displayed here.
export default function AuthorsContextSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>{asArray(content).length === 1 ? "Author" : "Authors"}</SectionLabel>
      <div className="flex flex-col gap-3">
        {asArray(content).map((author, i) => (
          <div key={i} className="border border-edge rounded-card px-4 py-3 flex flex-col gap-2">
            <div className="flex gap-3">
              {author.image_url && (
                <img
                  src={safeImageSrc(author.image_url)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="shrink-0 w-12 h-12 rounded-full object-cover bg-white/[0.06]"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                />
              )}
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-semibold text-ink">{unescapeDollar(author.name)}</span>
                <p className="text-xs font-semibold tracking-widest uppercase text-(--accent)/80">{unescapeDollar(author.role)}</p>
                {author.one_line && (
                  <p className="text-sm text-ink-dim leading-snug mt-1"><MathText text={author.one_line} /></p>
                )}
                {author.affiliation && (
                  <p className="text-xs text-ink-faint mt-0.5">{unescapeDollar(author.affiliation)}</p>
                )}
              </div>
            </div>
            {author.image_url && author.image_attribution && (
              <p className="text-[10px] text-ink-faint leading-snug">{unescapeDollar(author.image_attribution)}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
