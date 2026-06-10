interface Props {
  content: string
}

export default function OneLinerSection({ content }: Props) {
  return (
    <div className="px-5 py-8">
      <p className="text-xl font-semibold text-zinc-100 leading-snug">{content}</p>
    </div>
  )
}
