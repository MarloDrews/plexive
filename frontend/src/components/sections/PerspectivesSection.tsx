import SectionLabel from "../SectionLabel"
import type { PerspectiveItem } from "../../types/post"

interface Props {
  content: PerspectiveItem[]
}

export default function PerspectivesSection({ content }: Props) {
  return (
    <div className="px-5 py-6 flex flex-col gap-10">
      <SectionLabel className="-mb-4">Perspectives</SectionLabel>
      {content.map((p, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div>
            <h3 className="text-base font-semibold text-emerald-400 leading-snug">{p.position_name}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{p.school_or_thinker}</p>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{p.body}</p>
          <div className="border-l-2 border-emerald-400/40 pl-3 flex flex-col gap-2">
            <p className="text-xs text-zinc-400 leading-relaxed">
              <span className="font-semibold text-zinc-300">Strongest argument: </span>
              {p.strongest_argument}
            </p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              <span className="font-semibold text-zinc-400">Example: </span>
              {p.concrete_example}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
