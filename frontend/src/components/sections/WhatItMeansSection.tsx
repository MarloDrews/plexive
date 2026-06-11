import SectionLabel from "../SectionLabel"

interface Props {
  content: string
}

export default function WhatItMeansSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">What It Means</SectionLabel>
      <p className="prose-post text-ink-dim">{content}</p>
    </div>
  )
}
