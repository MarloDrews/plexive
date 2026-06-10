import SectionLabel from "../SectionLabel"

interface Props {
  content: string
}

export default function HistoryOfTheQuestionSection({ content }: Props) {
  return (
    <div className="px-5 py-6">
      <SectionLabel className="mb-3">History of the Question</SectionLabel>
      <p className="text-sm text-zinc-400 leading-relaxed">{content}</p>
    </div>
  )
}
