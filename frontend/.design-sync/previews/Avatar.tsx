import { Avatar } from 'plexive'

// Plexive renders on a dark "Stage" (surface-0). The card body is white, so
// each preview bleeds a dark panel to the card edges to match the real app.
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: -24,
        padding: 40,
        boxSizing: 'border-box',
        background: 'var(--color-surface-0)',
        color: 'var(--color-ink)',
        fontFamily: 'var(--font-source-sans)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 28,
        alignItems: 'center',
        minHeight: 160,
      }}
    >
      {children}
    </div>
  )
}

// Initial-letter fallback (no image), the form most avatars take in feeds.
export function Initials() {
  return (
    <Stage>
      <Avatar username="ada" size={32} />
      <Avatar username="grace" size={44} />
      <Avatar username="alan" size={64} />
    </Stage>
  )
}

// Verification ring: level 1 purple, level 2 green, level 3 red.
export function Verified() {
  return (
    <Stage>
      <Avatar username="curie" size={56} verified={1} />
      <Avatar username="bohr" size={56} verified={2} />
      <Avatar username="tesla" size={56} verified={3} />
    </Stage>
  )
}
