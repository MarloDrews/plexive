import { IdentitySection } from 'plexive'

function Stage({ children, accent = '#c47dcc' }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        margin: -24,
        padding: '16px 0',
        boxSizing: 'border-box',
        background: 'var(--color-surface-0)',
        color: 'var(--color-ink)',
        ['--accent' as never]: accent,
      }}
    >
      <div style={{ maxWidth: 540, margin: '0 auto' }}>{children}</div>
    </div>
  )
}

// A person's defining one-line identity (people format).
export function Default() {
  return (
    <Stage>
      <IdentitySection content="Marie Curie - the only person to win Nobel Prizes in two different sciences, and the first to win one at all as a woman." />
    </Stage>
  )
}
