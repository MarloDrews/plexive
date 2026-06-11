interface Props {
  content: string
}

export default function WhyEnduresSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <div className="border-l-2 border-(--accent) pl-4">
        <p className="prose-post">{content}</p>
      </div>
    </div>
  )
}
