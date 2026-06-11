import SectionLabel from "../SectionLabel"

interface Props {
  content: string
}

export default function WhatHangsOnItSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">What Hangs On It</SectionLabel>
      <p className="prose-post text-ink-dim">{content}</p>
    </div>
  )
}
