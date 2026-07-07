import SectionLabel from "../SectionLabel"
import type { KeyFindingItem } from "../../types/post"
import SvgBlock from "../SvgBlock"
import ContentImage from "./ContentImage"
import MathText from "../MathText"
import Prose from "../Prose"
import { unescapeDollar } from "@/lib/prose"
import { asArray } from "@/lib/asArray"

interface Props {
  content: KeyFindingItem[]
  isUserContent: boolean
}

export default function KeyFindingsSection({ content, isUserContent }: Props) {
  return (
    // The Academy KEY section (LAYOUT_STANDARD s7): the one section carrying the
    // accent left-border plus a faint wash, marking the post's payoff. Same
    // treatment Facts uses on surprises and Concepts on how_to_apply.
    <div className="px-6 py-8 flex flex-col gap-5 border-l-2 border-(--accent) bg-(--accent)/[0.06]">
      <SectionLabel>Key Findings</SectionLabel>
      {asArray(content).map((item, i) => (
        <div key={i} className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">{unescapeDollar(item.title)}</p>
          <Prose className="text-ink-dim">
            <MathText text={item.finding} />
          </Prose>
          {/* Effect size and significance reported together (methodological
              honesty): magnitude matters as much as the p-value. */}
          {(item.effect_size || item.statistical_detail) && (
            <p className="text-xs font-mono text-ink-muted">
              {unescapeDollar([item.effect_size, item.statistical_detail].filter(Boolean).join("  ·  "))}
            </p>
          )}
          {item.visual_svg && (
            <div className="w-full max-w-[360px] mx-auto mt-1">
              <SvgBlock svg={item.visual_svg} isUserContent={isUserContent} />
            </div>
          )}
          {item.image_url && (
            <ContentImage
              url={item.image_url}
              caption={item.image_caption}
              attribution={item.image_attribution}
              className="w-full max-w-[360px] mx-auto mt-1"
            />
          )}
          {item.source_in_paper && (
            <p className="text-xs text-ink-faint">Source: {unescapeDollar(item.source_in_paper)}</p>
          )}
        </div>
      ))}
    </div>
  )
}
