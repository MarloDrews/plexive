import SectionLabel from "../SectionLabel"
import type { FieldContextContent } from "../../types/post"

interface Props {
  content: FieldContextContent
}

export default function FieldContextSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>Field Context</SectionLabel>
      <p className="prose-post text-ink-dim">{content.body}</p>
      {content.key_priors.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-widest text-ink-faint">Key prior work</p>
          {content.key_priors.map((prior, i) => (
            <div key={i} className="border-l-2 border-edge-strong pl-3 flex flex-col gap-0.5">
              <p className="text-xs text-ink-muted font-medium">{prior.citation}</p>
              <p className="text-sm text-ink-body leading-snug">{prior.claim}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
