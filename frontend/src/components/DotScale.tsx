// Difficulty as three neutral dots; the per-format accent stays on the
// format marker and the teaser bullets only. Shared by the feed card footer
// and the post detail meta row so both render the identical scale.
export default function DotScale({ value }: { value: 1 | 2 | 3 }) {
  return (
    // The dots carry the value visually only, so both call sites get the same
    // spoken equivalent from here (A11Y-020). The sr-only span is absolutely
    // positioned, so it is not a flex item and adds no gap to the parent row.
    <>
      <span className="flex gap-1" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`inline-block w-1 h-1 rounded-full ${i <= value ? "bg-ink-dim" : "bg-white/15"}`}
          />
        ))}
      </span>
      <span className="sr-only">{`Difficulty ${value} of 3`}</span>
    </>
  )
}
