import { KeyNumbersSection } from 'plexive'

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

// A two-column stat grid: value + unit + label, in accent-tinted cards.
const NUMBERS = [
  { value: '37.2', unit: 'trillion', label: 'cells in the human body' },
  { value: '100,000', unit: 'km', label: 'blood vessels, end to end' },
  { value: '86', unit: 'billion', label: 'neurons in the brain' },
  { value: '2.5', unit: 'petabytes', label: 'estimated memory capacity' },
]

export function Default() {
  return (
    <Stage>
      <KeyNumbersSection content={NUMBERS} />
    </Stage>
  )
}
