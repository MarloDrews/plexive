import SectionLabel from "../SectionLabel"
import Prose from "../Prose"
import MathText from "../MathText"
interface Props {
  content: string
}

export default function HeartSection({ content }: Props) {
  return (
    // The Books key section (LAYOUT_STANDARD s7): the one section carrying the
    // accent left-border plus a faint wash, marking the post's payoff. Mirrors the
    // people key section (WhyTheyMatterSection), facts (SurprisesSection), and
    // concepts (HowToApplySection). Exactly one section per format is marked.
    <div className="px-6 py-8 border-l-2 border-(--accent) bg-(--accent)/[0.06]">
      <SectionLabel className="mb-3">The Heart of It</SectionLabel>
      <Prose><MathText text={content} /></Prose>
    </div>
  )
}
