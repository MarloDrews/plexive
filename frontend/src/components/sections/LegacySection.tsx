import SectionLabel from "../SectionLabel"
interface LegacyContent {
  body: string
  present_day_impact?: string
}

interface Props {
  content: LegacyContent
}

export default function LegacySection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-4">
      <SectionLabel>Legacy</SectionLabel>
      <p className="prose-post">{content.body}</p>
      {content.present_day_impact && (
        <div className="bg-(--accent)/10 border border-(--accent)/25 rounded-lg px-4 py-3">
          <p className="text-sm text-ink leading-relaxed">{content.present_day_impact}</p>
        </div>
      )}
    </div>
  )
}
