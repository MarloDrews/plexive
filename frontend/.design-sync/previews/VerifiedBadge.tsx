import { VerifiedBadge, Avatar } from 'plexive'

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
        gap: 32,
        alignItems: 'center',
        minHeight: 140,
      }}
    >
      {children}
    </div>
  )
}

// User trust levels: 1 purple, 2 green, 3 red. Shown large enough to read.
export function Levels() {
  return (
    <Stage>
      <VerifiedBadge level={1} size={32} />
      <VerifiedBadge level={2} size={32} />
      <VerifiedBadge level={3} size={32} />
    </Stage>
  )
}

// The official seal (brand lamp) used on Plexive seed content, not accounts.
export function Official() {
  return (
    <Stage>
      <VerifiedBadge variant="official" size={32} />
    </Stage>
  )
}

// How it reads beside a username, the way it appears in the app.
export function InContext() {
  return (
    <Stage>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Avatar username="curie" size={28} verified={2} />
        <span style={{ fontWeight: 600, color: 'var(--color-ink)' }}>marie</span>
        <VerifiedBadge level={2} size={16} />
      </span>
    </Stage>
  )
}
