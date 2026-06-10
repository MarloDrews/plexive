import SectionLabel from "../SectionLabel"
import type { YourTurnContent } from "../../types/post"

interface Props {
  content: YourTurnContent
}

export default function YourTurnSection({ content }: Props) {
  return (
    <div className="px-5 py-6 flex flex-col gap-4">
      <SectionLabel>Your Turn</SectionLabel>
      <p className="text-sm text-zinc-400 leading-relaxed">{content.intro}</p>
      <ol className="flex flex-col gap-3">
        {content.prompts.map((prompt, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-400/15 border border-emerald-400/40 text-emerald-400 text-xs flex items-center justify-center font-semibold mt-0.5">
              {i + 1}
            </span>
            <p className="text-sm text-zinc-300 leading-relaxed">{prompt}</p>
          </li>
        ))}
      </ol>
      {content.closing_thought && (
        <p className="text-xs text-zinc-500 leading-relaxed italic border-t border-zinc-800 pt-3">
          {content.closing_thought}
        </p>
      )}
    </div>
  )
}
