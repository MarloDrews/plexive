import SectionLabel from "../SectionLabel"

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

export default function FormalDefinitionSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>Formal Definition</SectionLabel>
      <p className="prose-post text-ink-dim">{content.body}</p>
      {content.formula && (
        <div className="bg-surface-1 border border-edge rounded-card px-4 py-3">
          <p className="font-mono text-sm text-(--accent) tracking-wide">{content.formula}</p>
        </div>
      )}
      {content.notation_legend && content.notation_legend.length > 0 && (
        <div className="flex flex-col gap-2">
          {content.notation_legend.map((entry, i) => (
            <div key={i} className="flex gap-3 items-baseline">
              <span className="font-mono text-xs text-(--accent) shrink-0 min-w-[48px]">{entry.symbol}</span>
              <span className="text-xs text-ink-muted leading-snug">{entry.meaning}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
