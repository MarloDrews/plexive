import SectionLabel from "../SectionLabel"
import SvgBlock from "../SvgBlock"
import type { WhatScienceSaysContent } from "../../types/post"

interface Props {
  content: WhatScienceSaysContent
  isUserContent: boolean
}

export default function WhatScienceSaysSection({ content, isUserContent }: Props) {
  return (
    <div className="px-5 py-6 flex flex-col gap-4">
      <SectionLabel>What Science Says</SectionLabel>
      <p className="text-sm text-zinc-300 leading-relaxed">{content.body}</p>
      {content.key_findings && content.key_findings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {content.key_findings.map((finding, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-emerald-400 text-sm mt-0.5 shrink-0">→</span>
              <span className="text-sm text-zinc-400 leading-snug">{finding}</span>
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
