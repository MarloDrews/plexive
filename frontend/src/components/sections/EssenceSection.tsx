import MathText from "../MathText"

interface Props {
  content: string
}

export default function EssenceSection({ content }: Props) {
  return (
    <div className="px-5 py-10 flex items-center justify-center min-h-[140px]">
      <p className="text-2xl font-semibold text-ink leading-snug text-center max-w-sm">
        <MathText text={content} />
      </p>
    </div>
  )
}
