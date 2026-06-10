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
    <div className="px-5 py-6 flex flex-col gap-4">
      <SectionLabel>Legacy</SectionLabel>
      <p className="text-base text-zinc-300 leading-relaxed">{content.body}</p>
      {content.present_day_impact && (
        <div className="bg-rose-400/10 border border-rose-400/25 rounded-lg px-4 py-3">
          <p className="text-sm text-rose-200 leading-relaxed">{content.present_day_impact}</p>
        </div>
      )}
    </div>
  )
}
