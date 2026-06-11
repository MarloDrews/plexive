import SectionLabel from "../SectionLabel"

interface KeyThinker {
  name: string
  role: string
  one_line: string
}

interface OriginContent {
  body: string
  key_thinkers?: KeyThinker[]
}

interface Props {
  content: OriginContent
}

export default function OriginSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>Origin</SectionLabel>
      <p className="prose-post text-ink-dim">{content.body}</p>
      {content.key_thinkers && content.key_thinkers.length > 0 && (
        <div className="flex flex-col gap-2">
          {content.key_thinkers.map((thinker, i) => (
            <div key={i} className="flex flex-col gap-0.5 border border-edge rounded-card px-4 py-3">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-ink">{thinker.name}</span>
                <span className="text-xs text-(--accent)/80">{thinker.role}</span>
              </div>
              <p className="text-xs text-ink-muted leading-snug">{thinker.one_line}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
