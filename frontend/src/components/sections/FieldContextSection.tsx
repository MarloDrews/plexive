import SectionLabel from "../SectionLabel"
import MathText from "../MathText"
import Prose from "../Prose"
import { unescapeDollar } from "@/lib/prose"
import { asArray } from "@/lib/asArray"
import type { FieldContextContent } from "../../types/post"

interface Props {
  content: FieldContextContent
}

export default function FieldContextSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>Field Context</SectionLabel>
      <Prose className="text-ink-dim">
        <MathText text={content.body} />
      </Prose>
      {asArray(content.key_priors).length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-widest text-ink-muted">Key prior work</p>
          {asArray(content.key_priors).map((prior, i) => (
            <div key={i} className="border-l-2 border-edge-strong pl-3 flex flex-col gap-0.5">
              <p className="text-xs text-ink-muted font-medium">{unescapeDollar(prior.citation)}</p>
              <p className="text-sm text-ink-body leading-snug"><MathText text={prior.claim} /></p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
