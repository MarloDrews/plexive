interface Props {
  content: string
}

export default function TheQuestionSection({ content }: Props) {
  return (
    <div className="px-5 py-8">
      <h2 className="text-2xl font-bold text-zinc-100 leading-snug">{content}</h2>
    </div>
  )
}
