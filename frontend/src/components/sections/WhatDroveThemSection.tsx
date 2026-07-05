import SectionLabel from "../SectionLabel"
import Prose from "../Prose"
import MathText from "../MathText"
interface Props {
  content: string
}

export default function WhatDroveThemSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">What Drove Them</SectionLabel>
      <Prose><MathText text={content} /></Prose>
    </div>
  )
}
