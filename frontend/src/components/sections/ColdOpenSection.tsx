interface Props {
  content: string
}

export default function ColdOpenSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <p className="prose-post text-ink font-medium">{content}</p>
    </div>
  )
}
