import type { KeyNumberItem } from "../../types/post"

interface Props {
  content: KeyNumberItem[]
}

export default function KeyNumbersSection({ content }: Props) {
  return (
    <div className="px-5 py-6">
      <div className="grid grid-cols-2 gap-3">
        {content.map((item, i) => (
          <div key={i} className="bg-surface-2 border border-edge-strong rounded-field px-4 py-4 flex flex-col gap-1">
            <span className="text-xl font-bold text-cyan-400 leading-none">{item.value}</span>
            {item.unit && (
              <span className="text-xs text-cyan-700 leading-none">{item.unit}</span>
            )}
            <span className="text-xs text-zinc-400 leading-snug mt-1">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
