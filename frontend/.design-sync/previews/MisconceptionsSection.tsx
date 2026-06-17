import { MisconceptionsSection } from 'plexive'

function Stage({ children, accent = '#72bb80' }: { children: React.ReactNode; accent?: string }) {
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

// Myth struck through in red, reality affirmed in green serif prose.
const ITEMS = [
  {
    myth: 'We only use 10% of our brains.',
    reality: 'Virtually every region of the brain is active over the course of a day; brain scans show no permanently dormant 90%.',
  },
  {
    myth: 'Goldfish have a three-second memory.',
    reality: 'Goldfish can remember tasks and locations for months, and can even be trained to respond to cues.',
  },
]

export function Default() {
  return (
    <Stage>
      <MisconceptionsSection content={ITEMS} />
    </Stage>
  )
}
