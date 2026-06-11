import SectionLabel from "../SectionLabel"
import type { CastMember } from "../../types/post"

interface Props {
  content: CastMember[]
}

export default function CastSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>Cast</SectionLabel>
      <div className="flex flex-col gap-3">
        {content.map((member, i) => (
          <div key={i} className="flex flex-col gap-0.5 border border-edge rounded-card px-4 py-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-semibold text-ink">{member.name}</span>
              <span className="text-xs text-ink-muted">{member.lifespan}</span>
            </div>
            <p className="text-xs font-semibold tracking-widest uppercase text-(--accent)/80">{member.role}</p>
            <p className="text-sm text-ink-dim leading-snug mt-1">{member.one_line}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
