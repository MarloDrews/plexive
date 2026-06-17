import { TheQuestionSection } from 'plexive'

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

// The central question of a Q&A post, set as a bold heading.
export function Default() {
  return (
    <Stage>
      <TheQuestionSection content="If free will is an illusion, why does it feel so real - and does the answer change how we should treat each other?" />
    </Stage>
  )
}
