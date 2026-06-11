import SectionLabel from "../SectionLabel"
import type { YourTurnContent } from "../../types/post"

interface Props {
  content: YourTurnContent
}

export default function YourTurnSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>Your Turn</SectionLabel>
      <p className="prose-post text-ink-dim">{content.intro}</p>
      <ol className="flex flex-col gap-3">
        {content.prompts.map((prompt, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-(--accent)/15 border border-(--accent)/40 text-(--accent) text-xs flex items-center justify-center font-semibold mt-0.5">
              {i + 1}
            </span>
            <p className="prose-post">{prompt}</p>
          </li>
        ))}
      </ol>
      {content.closing_thought && (
        <p className="text-xs text-ink-muted leading-relaxed italic border-t border-edge pt-3">
          {content.closing_thought}
        </p>
      )}
    </div>
  )
}
