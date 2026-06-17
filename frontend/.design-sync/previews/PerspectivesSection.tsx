import { PerspectivesSection } from 'plexive'

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

// Competing positions on a debate, each with its strongest argument and a
// concrete example - the structure of a Q&A "perspectives" section.
const POSITIONS = [
  {
    position_name: 'Free will is real',
    school_or_thinker: 'Libertarianism (Robert Kane)',
    body: 'We experience ourselves as genuine authors of our choices, and moral responsibility seems to require that we could have done otherwise.',
    strongest_argument: 'Quantum indeterminacy leaves room for outcomes not fixed by prior states.',
    concrete_example: 'An agonising ethical decision where you deliberate, then choose against your own habit.',
  },
  {
    position_name: 'Free will is an illusion',
    school_or_thinker: 'Hard determinism (Sam Harris)',
    body: 'Every choice is the product of prior causes - genes, upbringing, brain states - that you did not author and cannot step outside of.',
    strongest_argument: 'Neuroscience can detect decisions forming before subjects report being aware of them.',
    concrete_example: 'Brain-imaging studies predicting a button press seconds before the conscious choice.',
  },
]

export function Default() {
  return (
    <Stage>
      <PerspectivesSection content={POSITIONS} />
    </Stage>
  )
}
