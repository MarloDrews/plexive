import SectionLabel from "../SectionLabel"
interface Props {
  content: string
}

export default function BiggerPictureSection({ content }: Props) {
  return (
    <div className="px-5 py-6">
      <SectionLabel className="mb-3">The Bigger Picture</SectionLabel>
      <p className="text-base text-zinc-200 leading-relaxed font-medium">{content}</p>
    </div>
  )
}
