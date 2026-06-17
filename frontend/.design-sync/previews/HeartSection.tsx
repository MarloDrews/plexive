import { HeartSection } from 'plexive'

function Stage({ children, accent = '#6b9eff' }: { children: React.ReactNode; accent?: string }) {
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

// The emotional core of a book, in the serif reading voice (prose-post).
export function Default() {
  return (
    <Stage>
      <HeartSection content="At its heart, the book is about the cost of certainty - how the people most sure they are right are often the ones who have stopped looking. It asks the reader to hold their convictions a little more loosely, and to treat doubt not as weakness but as the beginning of understanding." />
    </Stage>
  )
}
