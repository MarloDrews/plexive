import SectionLabel from "../SectionLabel"
interface Props {
  content: string[]
}

export default function TangibleSection({ content }: Props) {
  return (
    <div className="px-5 py-6">
      <SectionLabel className="mb-4">Make It Tangible</SectionLabel>
      <ul className="flex flex-col gap-3">
        {content.map((line, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="text-cyan-400 text-sm mt-0.5 shrink-0">•</span>
            <span className="text-sm text-zinc-300 leading-relaxed">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
