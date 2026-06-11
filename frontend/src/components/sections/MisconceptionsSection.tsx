import SectionLabel from "../SectionLabel"
import type { MisconceptionItem } from "../../types/post"

interface Props {
  content: MisconceptionItem[]
}

export default function MisconceptionsSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-4">Common Misconceptions</SectionLabel>
      <div className="flex flex-col gap-4">
        {content.map((item, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <span className="text-bad text-xs mt-0.5 shrink-0 font-bold">✕</span>
              <span className="text-sm text-ink-muted line-through leading-relaxed">{item.myth}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-good text-xs mt-0.5 shrink-0 font-bold">✓</span>
              <span className="prose-post">{item.reality}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
