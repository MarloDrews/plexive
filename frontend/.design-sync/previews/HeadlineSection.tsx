import { HeadlineSection } from 'plexive'

// The big post hook. Numbers inside the text are auto-tinted with --accent.
function Stage({ children, accent = '#5bc8bc' }: { children: React.ReactNode; accent?: string }) {
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

export function Default() {
  return (
    <Stage>
      <HeadlineSection content="Your body replaces 330 billion cells every single day - a new you, three times over, before lunch." />
    </Stage>
  )
}
