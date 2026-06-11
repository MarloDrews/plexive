import SectionLabel from "../SectionLabel"
interface Props {
  content: string[]
}

export default function TangibleSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-4">Make It Tangible</SectionLabel>
      <ul className="flex flex-col gap-3">
        {content.map((line, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="text-(--accent) text-sm mt-0.5 shrink-0">•</span>
            <span className="prose-post">{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
