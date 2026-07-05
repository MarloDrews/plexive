import type { KeyNumberItem } from "../../types/post"
import { unescapeDollar } from "@/lib/prose"

interface Props {
  content: KeyNumberItem[]
}

export default function KeyNumbersSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <div className="grid grid-cols-2 gap-3">
        {content.map((item, i) => (
          <div key={i} className="bg-surface-2 border border-edge-strong rounded-field px-4 py-4 flex flex-col gap-1">
            <span className="text-xl font-bold text-(--accent) leading-none">{unescapeDollar(item.value)}</span>
            {item.unit && (
              <span className="text-xs text-(--accent)/70 leading-none">{unescapeDollar(item.unit)}</span>
            )}
            <span className="text-xs text-ink-dim leading-snug mt-1">{unescapeDollar(item.label)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
