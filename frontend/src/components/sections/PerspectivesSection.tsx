import SectionLabel from "../SectionLabel"
import type { PerspectiveItem } from "../../types/post"

interface Props {
  content: PerspectiveItem[]
}

export default function PerspectivesSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-10">
      <SectionLabel className="-mb-4">Perspectives</SectionLabel>
      {content.map((p, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div>
            <h3 className="text-base font-semibold text-(--accent) leading-snug">{p.position_name}</h3>
            <p className="text-xs text-ink-muted mt-0.5">{p.school_or_thinker}</p>
          </div>
          <p className="prose-post">{p.body}</p>
          <div className="border-l-2 border-(--accent)/40 pl-3 flex flex-col gap-2">
            <p className="text-xs text-ink-dim leading-relaxed">
              <span className="font-semibold text-ink-body">Strongest argument: </span>
              {p.strongest_argument}
            </p>
            <p className="text-xs text-ink-muted leading-relaxed">
              <span className="font-semibold text-ink-dim">Example: </span>
              {p.concrete_example}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
