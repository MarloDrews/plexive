// Verification badges.
// level 1 = purple circle, level 2 = green circle, level 3+ = dark red circle, all with checkmark.
// variant="official" is for official Deepscroll seed content (not user accounts).

const LEVEL_COLOR: Record<number, string> = {
  1: "var(--color-fmt-concepts)",
  2: "var(--color-good)",
  3: "#b91c1c",
}

function levelColor(level: number): string {
  return LEVEL_COLOR[level] ?? LEVEL_COLOR[3]
}

interface Props {
  size?: number
  level?: number
  variant?: "official"
}

export default function VerifiedBadge({ size = 16, level = 1, variant }: Props) {
  if (variant === "official") {
    return (
      <svg viewBox="0 0 16 16" width={size} height={size} className="shrink-0 text-lamp" fill="currentColor" role="img" aria-label="Official">
        <circle cx="8" cy="8" r="8" />
        <path d="M5 8.5l2 2 4-4" stroke="var(--color-surface-0)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    )
  }

  const color = levelColor(level)

  return (
    // role="img" is required for the label to be exposed: an svg with only an
    // aria-label is not reliably announced. The level is part of the name
    // because color is the only other thing that carries it (A11Y-022).
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" role="img" aria-label={`Verified, level ${level}`} className="shrink-0" style={{ color }}>
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      <path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="var(--color-surface-0)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
