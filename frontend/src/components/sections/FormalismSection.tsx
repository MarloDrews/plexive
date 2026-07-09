import SectionLabel from "../SectionLabel"
import type { FormalismContent } from "../../types/post"
import DisplayMath from "../DisplayMath"
import MathText from "../MathText"
import Prose from "../Prose"
import { unescapeDollar } from "@/lib/prose"
import { asArray } from "@/lib/asArray"

interface Props {
  content: FormalismContent
}

export default function FormalismSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-5">
      <SectionLabel>Formalism</SectionLabel>

      <Prose className="text-ink-dim">
        <MathText text={content.body} />
      </Prose>

      <div className="flex flex-col gap-5">
        {asArray(content.equations).map((eq, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-(--accent) uppercase tracking-wide">{unescapeDollar(eq.label)}</p>
            <div className="bg-surface-1 rounded-card px-4 py-3 border border-edge">
              <DisplayMath latex={eq.latex} />
            </div>
            <Prose className="text-ink-dim">
              <MathText text={eq.description} />
            </Prose>
          </div>
        ))}
      </div>

      {asArray(content.notation_legend).length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-widest text-ink-muted">Notation</p>
          <div className="flex flex-col divide-y divide-edge">
            {asArray(content.notation_legend).map((item, i) => (
              <div key={i} className="flex gap-4 py-2 items-baseline">
                <div className="shrink-0 w-28">
                  <MathText text={`$${item.symbol}$`} className="text-sm text-ink-body font-mono" />
                </div>
                <p className="text-sm text-ink-dim leading-snug">{unescapeDollar(item.meaning)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
