import SectionLabel from "../SectionLabel"
import SvgBlock from "../SvgBlock"
import Prose from "../Prose"
import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"
import type { PerspectiveItem } from "../../types/post"

interface Props {
  content: PerspectiveItem[]
  isUserContent: boolean
}

export default function PerspectivesSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-10">
      <SectionLabel className="-mb-4">Perspectives</SectionLabel>
      {content.map((p, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div>
            <h3 className="text-base font-semibold text-(--accent) leading-snug">{unescapeDollar(p.position_name)}</h3>
            {p.school_or_thinker && (
              <p className="text-xs text-ink-muted mt-0.5">{unescapeDollar(p.school_or_thinker)}</p>
            )}
          </div>
          <Prose><MathText text={p.body} /></Prose>
          <div className="border-l-2 border-(--accent)/40 pl-3 flex flex-col gap-2">
            {/* Running text matches the position body (prose-post: full body size
                and ink-body contrast); only the bold labels set it apart. */}
            <Prose>
              <span className="font-semibold text-(--accent)">Strongest argument: </span>
              <MathText text={p.strongest_argument} />
            </Prose>
            {p.concrete_example && (
              <Prose>
                <span className="font-semibold text-ink-body">Example: </span>
                <MathText text={p.concrete_example} />
              </Prose>
            )}
          </div>
          {/* In-body diagram, rendered the same way facts/concepts render an
              inline visual_svg (SvgBlock handles the user/seed security split and
              the legacy accent re-palette; var(--accent) resolves from the page). */}
          {p.visual_svg && (
            <SvgBlock
              svg={p.visual_svg}
              isUserContent={isUserContent}
              className="w-full max-w-[400px] mx-auto mt-2"
            />
          )}
        </div>
      ))}
    </div>
  )
}
