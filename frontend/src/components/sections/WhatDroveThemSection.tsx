import SectionLabel from "../SectionLabel"
interface Props {
  content: string
}

export default function WhatDroveThemSection({ content }: Props) {
  return (
    <div className="px-6 py-8">
      <SectionLabel className="mb-3">What Drove Them</SectionLabel>
      <p className="prose-post">{content}</p>
    </div>
  )
}
