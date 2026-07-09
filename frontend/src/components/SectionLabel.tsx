// Editorial micro-label used as the header of every post section.
// LAYOUT_STANDARD section 7: identical on every section, in the format accent.
// The repeated caps label in the format accent is the through-line that makes the
// page read as one system; only the accent color differs per format. Size is never
// enlarged; the accent carries the emphasis.
// data-no-read keeps labels out of read-aloud: only content is spoken.
// Level: the page title is the h1, so each section label is an h2 and the item
// titles inside a section are h3 (A11Y-010, no skipped levels).

interface Props {
  children: React.ReactNode
  className?: string
}

export default function SectionLabel({ children, className = "" }: Props) {
  return (
    <h2 data-no-read className={`label-caps text-(--accent) ${className}`}>
      {children}
    </h2>
  )
}
