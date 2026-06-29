import SectionLabel from "../SectionLabel"
import SvgBlock from "../SvgBlock"
import Prose from "../Prose"
import MathText from "../MathText"

interface HowToApplyContent {
  body: string
  checklist?: string[]
  visual_svg?: string
}

interface Props {
  content: HowToApplyContent
  isUserContent: boolean
}

export default function HowToApplySection({ content, isUserContent }: Props) {
  return (
    // The concepts key section (LAYOUT_STANDARD s7): the one section carrying the
    // accent left-border plus a faint wash, marking the post's payoff. Mirrors the
    // facts key section (SurprisesSection).
    <div className="px-6 py-8 flex flex-col gap-4 border-l-2 border-(--accent) bg-(--accent)/[0.06]">
      <SectionLabel>How to Apply It</SectionLabel>
      <Prose className="text-ink-dim"><MathText text={content.body} /></Prose>
      {content.checklist && content.checklist.length > 0 && (
        <ul className="flex flex-col gap-2">
          {content.checklist.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="shrink-0 w-4 h-4 rounded border border-(--accent)/40 mt-0.5 flex items-center justify-center">
                <span className="w-2 h-2 rounded-sm bg-(--accent)/50" />
              </span>
              <span className="text-sm text-ink-body leading-snug"><MathText text={item} /></span>
            </li>
          ))}
        </ul>
      )}
      {content.visual_svg && (
        <SvgBlock
          svg={content.visual_svg}
          isUserContent={isUserContent}
          className="w-full max-w-[400px] mx-auto mt-2"
        />
      )}
    </div>
  )
}
