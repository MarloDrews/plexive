import { OneLinerSection } from 'plexive'

function Stage({ children, accent = '#9b8ae0' }: { children: React.ReactNode; accent?: string }) {
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

// A concept distilled to a single memorable line.
export function Default() {
  return (
    <Stage>
      <OneLinerSection content="Entropy is time's arrow: the reason a shattered cup never reassembles, written into the laws of physics." />
    </Stage>
  )
}
