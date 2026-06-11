interface Props {
  content: string
}

export default function HeartSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <p className="prose-post">{content}</p>
    </div>
  )
}
