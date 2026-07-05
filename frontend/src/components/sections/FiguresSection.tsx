import SectionLabel from "../SectionLabel"
import ContentImage from "./ContentImage"
import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"
import type { FigureItem } from "../../types/post"

interface Props {
  content: FigureItem[]
}

// Academy figures: the paper's own multi-panel evidence no single finding owns.
// Each entry is a sourced image (licence permitting) with a label, technical
// caption (inline $...$ allowed) and attribution. ContentImage keeps the image
// width-capped so it never overflows the page (LAYOUT_STANDARD s5).
export default function FiguresSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-5">
      <SectionLabel>Figures</SectionLabel>
      {content.map((fig, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          {fig.figure_label && (
            <p className="text-xs font-semibold text-(--accent) uppercase tracking-wide">
              {unescapeDollar(fig.figure_label)}
            </p>
          )}
          <ContentImage
            url={fig.image_url}
            attribution={fig.image_attribution}
            className="w-full max-w-[360px] mx-auto"
          />
          {fig.image_caption && (
            <p className="text-xs text-ink-muted leading-relaxed">
              <MathText text={fig.image_caption} />
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
