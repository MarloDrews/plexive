import type { VoiceItem } from "../../types/post"

interface Props {
  content: VoiceItem[]
}

export default function VoicesSection({ content }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-5">
      {content.map((voice, i) => (
        <blockquote key={i} className="border-l-2 border-edge-strong pl-4">
          <p className="text-lg font-serif text-ink leading-relaxed">
            &ldquo;{voice.quote}&rdquo;
          </p>
          <footer className="mt-2 text-sm italic text-ink-dim">
            &mdash; {voice.attribution}
          </footer>
        </blockquote>
      ))}
    </div>
  )
}
