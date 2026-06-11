// Verification badges.
// level 1 = purple, level 2 = green, level 3+ = blue.
// variant="official" is for official Deepscroll seed content (not user accounts).

const LEVEL_COLOR: Record<number, string> = {
  1: "var(--color-fmt-concepts)",
  2: "var(--color-good)",
  3: "var(--color-fmt-academy)",
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
      <svg viewBox="0 0 16 16" width={size} height={size} className="shrink-0 text-lamp" fill="currentColor" aria-label="Official">
        <circle cx="8" cy="8" r="8" />
        <path d="M5 8.5l2 2 4-4" stroke="var(--color-surface-0)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" aria-label="Verified" className="shrink-0" style={{ color: levelColor(level) }}>
      <circle cx="8" cy="8" r="8" fill="currentColor" />
      <path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="var(--color-surface-0)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
