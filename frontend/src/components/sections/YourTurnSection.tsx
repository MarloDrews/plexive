import SectionLabel from "../SectionLabel"
import Prose from "../Prose"
import MathText from "../MathText"
import type { YourTurnContent } from "../../types/post"
import { asArray } from "@/lib/asArray"

interface Props {
  content: YourTurnContent
}

export default function YourTurnSection({ content }: Props) {
  return (
    // The questions key section (LAYOUT_STANDARD s7): the one section carrying the
    // accent left-border plus a faint wash, marking the post's payoff where the
    // reader is handed the decision. Mirrors the concepts key section
    // (HowToApplySection) and the facts one (SurprisesSection).
    <div className="px-6 py-8 flex flex-col gap-4 border-l-2 border-(--accent) bg-(--accent)/[0.06]">
      <SectionLabel>Your Turn</SectionLabel>
      <Prose className="text-ink-dim"><MathText text={content.intro} /></Prose>
      {/* Prompts use the shared open-question affordance (the accent "?" marker),
          since each prompt is a real question handed back to the reader. */}
      <ul className="flex flex-col gap-3">
        {asArray(content.prompts).map((prompt, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="text-(--accent) font-semibold text-sm mt-0.5 shrink-0">?</span>
            <Prose><MathText text={prompt} /></Prose>
          </li>
        ))}
      </ul>
      {content.closing_thought && (
        <p className="text-xs text-ink-muted leading-relaxed italic border-t border-edge pt-3">
          <MathText text={content.closing_thought} />
        </p>
      )}
    </div>
  )
}
