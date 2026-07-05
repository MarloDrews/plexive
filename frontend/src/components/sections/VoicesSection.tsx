import SectionLabel from "../SectionLabel"
import type { VoiceItem } from "../../types/post"
import { unescapeDollar } from "@/lib/prose"

interface Props {
  content: VoiceItem[]
  // Optional caps header. People passes "In Their Own Words"; Books passes
  // nothing and stays headerless, exactly as before.
  label?: string
}

export default function VoicesSection({ content, label }: Props) {
  return (
    <div className="px-6 py-8 flex flex-col gap-5">
      {label && <SectionLabel>{label}</SectionLabel>}
      {content.map((voice, i) => (
        <blockquote key={i} className="border-l-2 border-edge-strong pl-4">
          <p className="text-lg font-serif text-ink leading-relaxed">
            &ldquo;{unescapeDollar(voice.quote)}&rdquo;
          </p>
          <footer className="mt-2 text-sm italic text-ink-dim">
            &mdash; {unescapeDollar(voice.attribution)}
          </footer>
        </blockquote>
      ))}
    </div>
  )
}
