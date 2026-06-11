import SectionLabel from "../SectionLabel"

interface Example {
  title: string
  domain: string
  body: string
}

interface Props {
  content: Example[]
}

export default function RealWorldExamplesSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-8">
      <SectionLabel className="-mb-4">Real-World Examples</SectionLabel>
      {content.map((example, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div>
            <h3 className="text-sm font-semibold text-ink leading-snug">{example.title}</h3>
            <p className="text-xs text-(--accent)/80 font-semibold tracking-widest uppercase mt-0.5">{example.domain}</p>
          </div>
          <p className="prose-post text-ink-dim">{example.body}</p>
        </div>
      ))}
    </div>
  )
}
