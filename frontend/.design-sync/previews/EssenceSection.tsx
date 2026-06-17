import { EssenceSection } from 'plexive'

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

// The one-sentence essence of an idea, set large and centered.
export function Default() {
  return (
    <Stage>
      <EssenceSection content="Compound interest is the quiet engine of wealth: small gains, reinvested, snowball into outcomes that feel impossible until you see the curve." />
    </Stage>
  )
}
