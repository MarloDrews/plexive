import SectionLabel from "../SectionLabel"
interface Props {
  content: string
}

export default function BiggerPictureSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">The Bigger Picture</SectionLabel>
      <p className="prose-post text-ink font-medium">{content}</p>
    </div>
  )
}
