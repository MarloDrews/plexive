import SectionLabel from "../SectionLabel"
import SvgBlock from "../SvgBlock"
import Prose from "../Prose"
import MathText from "../MathText"
import type { WhatScienceSaysContent } from "../../types/post"

interface Props {
  content: WhatScienceSaysContent
  isUserContent: boolean
}

export default function WhatScienceSaysSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>What Science Says</SectionLabel>
      <Prose><MathText text={content.body} /></Prose>
      {content.key_findings && content.key_findings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {content.key_findings.map((finding, i) => (
            <li key={i} className="flex items-start gap-2.5">
              {/* Accent-dot list, the shared kit affordance for simple lists
                  (LAYOUT_STANDARD s7). */}
              <span className="w-1.5 h-1.5 rounded-full bg-(--accent) mt-2 shrink-0" />
              <span className="text-sm text-ink-dim leading-snug"><MathText text={finding} /></span>
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
