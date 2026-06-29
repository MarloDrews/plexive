import MathText from "../MathText"

interface Props {
  content: string
}

export default function IdentitySection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <p className="text-xl font-semibold text-ink leading-snug"><MathText text={content} /></p>
    </div>
  )
}
