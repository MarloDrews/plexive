interface Props {
  content: string[]
}

export default function StructureSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <ol className="flex flex-col gap-3">
        {content.map((item, i) => (
          <li key={i} className="flex gap-3 items-start">
            <span className="text-(--accent) font-semibold text-sm min-w-[1.25rem] pt-0.5">
              {i + 1}.
            </span>
            <span className="prose-post">{item}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
