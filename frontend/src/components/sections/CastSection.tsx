import SectionLabel from "../SectionLabel"
import type { CastMember } from "../../types/post"

interface Props {
  content: CastMember[]
}

export default function CastSection({ content }: Props) {
  return (
    <div className="px-5 py-6 flex flex-col gap-4">
      <SectionLabel>Cast</SectionLabel>
      <div className="flex flex-col gap-3">
        {content.map((member, i) => (
          <div key={i} className="flex flex-col gap-0.5 border border-zinc-800 rounded-xl px-4 py-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-semibold text-zinc-100">{member.name}</span>
              <span className="text-xs text-zinc-500">{member.lifespan}</span>
            </div>
            <p className="text-xs font-semibold tracking-widest uppercase text-orange-400/80">{member.role}</p>
            <p className="text-sm text-zinc-400 leading-snug mt-1">{member.one_line}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
