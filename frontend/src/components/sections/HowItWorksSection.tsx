import SectionLabel from "../SectionLabel"

interface Step {
  step_number: number
  title: string
  body: string
}

interface Props {
  content: Step[]
}

export default function HowItWorksSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-8">
      <SectionLabel className="-mb-4">How It Works</SectionLabel>
      {content.map((step, i) => (
        <div key={i} className="flex gap-4">
          <span className="shrink-0 w-6 h-6 rounded-full bg-(--accent)/15 border border-(--accent)/40 text-(--accent) text-xs flex items-center justify-center font-bold mt-0.5">
            {step.step_number}
          </span>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-(--accent) leading-snug">{step.title}</h3>
            <p className="prose-post text-ink-dim">{step.body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
