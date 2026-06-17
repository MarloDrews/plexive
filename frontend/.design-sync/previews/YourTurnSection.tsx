import { YourTurnSection } from 'plexive'

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

// A reflective close: intro, numbered prompts in accent chips, closing thought.
const CONTENT = {
  intro: 'Ideas stick when you put them to work. Before you scroll on, sit with one of these:',
  prompts: [
    'Think of a model you rely on daily. What detail does it deliberately leave out?',
    'When has a useful simplification led you to a wrong conclusion?',
    'Pick one belief you hold strongly. What would change your mind?',
  ],
  closing_thought: 'The goal is not to distrust every map - it is to remember you are holding one.',
}

export function Default() {
  return (
    <Stage>
      <YourTurnSection content={CONTENT} />
    </Stage>
  )
}
