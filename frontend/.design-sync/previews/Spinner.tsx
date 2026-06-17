import { Spinner } from 'plexive'

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: -24,
        padding: 48,
        boxSizing: 'border-box',
        background: 'var(--color-surface-0)',
        color: 'var(--color-ink)',
        display: 'flex',
        gap: 40,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 140,
      }}
    >
      {children}
    </div>
  )
}

// The two sizes, captured mid-spin (border-t-ink arc over a faint track).
export function Sizes() {
  return (
    <Stage>
      <Spinner size="sm" />
      <Spinner size="md" />
    </Stage>
  )
}
