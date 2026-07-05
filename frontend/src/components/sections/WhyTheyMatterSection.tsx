import SectionLabel from "../SectionLabel"
import Prose from "../Prose"
import MathText from "../MathText"
interface Props {
  content: string
}

export default function WhyTheyMatterSection({ content }: Props) {
  return (
    // The People key section (LAYOUT_STANDARD s7): the one section carrying the
    // accent left-border plus a faint wash, marking the post's payoff. Mirrors the
    // facts key section (SurprisesSection) and the concepts one (HowToApplySection).
    <div className="px-6 py-8 border-l-2 border-(--accent) bg-(--accent)/[0.06]">
      <SectionLabel className="mb-3">Why They Matter</SectionLabel>
      <Prose><MathText text={content} /></Prose>
    </div>
  )
}
