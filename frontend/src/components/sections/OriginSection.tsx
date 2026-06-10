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
    <div className="px-5 py-6 flex flex-col gap-4">
      <SectionLabel>Origin</SectionLabel>
      <p className="text-sm text-zinc-400 leading-relaxed">{content.body}</p>
      {content.key_thinkers && content.key_thinkers.length > 0 && (
        <div className="flex flex-col gap-2">
          {content.key_thinkers.map((thinker, i) => (
            <div key={i} className="flex flex-col gap-0.5 border border-zinc-800 rounded-xl px-4 py-3">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-zinc-100">{thinker.name}</span>
                <span className="text-xs text-violet-400/80">{thinker.role}</span>
              </div>
              <p className="text-xs text-zinc-500 leading-snug">{thinker.one_line}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
