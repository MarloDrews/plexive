import katex from "katex"
import SectionLabel from "../SectionLabel"
import MathText from "../MathText"
import Prose from "../Prose"
import { unescapeDollar } from "@/lib/prose"

interface NotationEntry {
  symbol: string
  meaning: string
}

interface FormalDefinitionContent {
  body: string
  formula?: string
  notation_legend?: NotationEntry[]
}

interface Props {
  content: FormalDefinitionContent
}

// Block-level math, same treatment as FormalismSection (questions). The formula
// is raw LaTeX, not wrapped in $...$, so it renders directly in display mode.
function DisplayMath({ latex }: { latex: string }) {
  let html = latex
  try {
    html = katex.renderToString(latex, { displayMode: true, throwOnError: false, output: "html" })
  } catch {
    // fall through to the raw string
  }
  return <div className="overflow-x-auto py-1 text-(--accent)" dangerouslySetInnerHTML={{ __html: html }} />
}

export default function FormalDefinitionSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>Formal Definition</SectionLabel>
      <Prose className="text-ink-dim">
        <MathText text={content.body} />
      </Prose>
      {content.formula && (
        <div className="bg-surface-1 border border-edge rounded-card px-4 py-3">
          <DisplayMath latex={content.formula} />
        </div>
      )}
      {content.notation_legend && content.notation_legend.length > 0 && (
        <div className="flex flex-col gap-2">
          {content.notation_legend.map((entry, i) => (
            <div key={i} className="flex gap-3 items-baseline">
              {/* The symbol is raw LaTeX; wrap it in $...$ so MathText renders it inline. */}
              <MathText text={`$${entry.symbol}$`} className="text-(--accent) shrink-0 min-w-[48px]" />
              <span className="text-xs text-ink-muted leading-snug">{unescapeDollar(entry.meaning)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
