import { EmptyState } from 'plexive'

// Empty-feed placeholder: a format icon over a serif headline. Each format
// has its own icon and accent ink (the "Circuit" format palette).
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: -24,
        padding: 48,
        boxSizing: 'border-box',
        background: 'var(--color-surface-0)',
        color: 'var(--color-ink)',
        fontFamily: 'var(--font-source-sans)',
        display: 'flex',
        justifyContent: 'center',
        minHeight: 200,
      }}
    >
      {children}
    </div>
  )
}

export function Books() {
  return (
    <Stage>
      <EmptyState format="books" accentColor="#6b9eff" />
    </Stage>
  )
}

export function Questions() {
  return (
    <Stage>
      <EmptyState format="questions" accentColor="#72bb80" />
    </Stage>
  )
}

export function People() {
  return (
    <Stage>
      <EmptyState format="people" accentColor="#c47dcc" />
    </Stage>
  )
}
