// The compass mark: a compass construction of a circle, drawn once.
//
// Built from the interface build specification. The geometry is a 24 unit
// construction rendered at any pixel size through the viewBox, so a later
// surface that wants a larger mark passes size and nothing else changes.
//
// Two SVG facts let the draw order work without rewriting a single path. A
// circle starts its path at (cx + r, cy), which here is 20,12, the outer end of
// the radius, and runs clockwise, so the sweep begins exactly where the radius
// ends. A line dashes from its first point, so 12,12 to 20,12 draws outward
// from the centre rather than inward to it.
//
// The animation itself lives in globals.css, next to every other animation in
// this project, together with its reduced-motion rule.

interface Props {
  size?: number
}

// 2 * Math.PI * 8, the circumference of the r=8 circle in viewBox units. Written
// out because globals.css needs the same number and CSS cannot compute it.
const CIRCUMFERENCE = 50.265

export default function CompassMark({ size = 64 }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className="text-ink-muted"
    >
      <circle
        className="compass-mark-circle"
        cx={12}
        cy={12}
        r={8}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="butt"
        strokeLinejoin="miter"
        strokeDasharray={CIRCUMFERENCE}
      />
      <line
        className="compass-mark-radius"
        x1={12}
        y1={12}
        x2={20}
        y2={12}
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="butt"
        strokeLinejoin="miter"
        strokeDasharray={8}
      />
      <circle className="compass-mark-centre" cx={12} cy={12} r={0.75} fill="currentColor" />
    </svg>
  )
}
