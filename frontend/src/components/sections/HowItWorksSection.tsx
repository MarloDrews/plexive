import SectionLabel from "../SectionLabel"
import SvgBlock from "../SvgBlock"
import Prose from "../Prose"
import MathText from "../MathText"
import { unescapeDollar } from "@/lib/prose"
import { asArray } from "@/lib/asArray"

interface Step {
  step_number: number
  title: string
  body: string
  visual_svg?: string
}

interface Props {
  content: Step[]
  isUserContent: boolean
}

export default function HowItWorksSection({ content, isUserContent }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-8">
      <SectionLabel className="-mb-4">How It Works</SectionLabel>
      {asArray(content).map((step, i) => (
        <div key={i} className="flex gap-4">
          <span className="shrink-0 w-6 h-6 rounded-full bg-(--accent)/15 border border-(--accent)/40 text-(--accent) text-xs flex items-center justify-center font-bold mt-0.5">
            {step.step_number}
          </span>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-(--accent) leading-snug">{unescapeDollar(step.title)}</h3>
            <Prose className="text-ink-dim"><MathText text={step.body} /></Prose>
            {step.visual_svg && (
              <SvgBlock
                svg={step.visual_svg}
                isUserContent={isUserContent}
                className="w-full max-w-[360px] mx-auto mt-2"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
