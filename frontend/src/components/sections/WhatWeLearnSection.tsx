import SectionLabel from "../SectionLabel"
import Prose from "../Prose"
import MathText from "../MathText"

interface Props {
  content: string
}

export default function WhatWeLearnSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">What We Learn</SectionLabel>
      <Prose className="text-ink-dim"><MathText text={content} /></Prose>
    </div>
  )
}
