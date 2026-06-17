import { CoreIdeasSection } from 'plexive'

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

// The workhorse of a concept post: titled ideas with prose, a pull-quote, and
// an "in practice" accent box.
const IDEAS = [
  {
    title: 'The map is not the territory',
    body: 'Every model we use to understand the world - a metaphor, a theory, a stereotype - is a compression. It throws away detail to become usable. The danger is forgetting that the compression happened, and mistaking the simplified map for the messy territory it describes.',
    quote: 'The map appears to us more real than the land.',
  },
  {
    title: 'Good maps are judged by use, not truth',
    body: 'No model is perfectly accurate, so the right question is never "is this true?" but "is this useful for what I am trying to do?" A subway map distorts geography on purpose - and is better for it.',
    in_practice: 'Before trusting a model, ask what it was built to do. A tool that is excellent for one decision can be actively misleading for another.',
  },
]

export function Default() {
  return (
    <Stage>
      <CoreIdeasSection content={IDEAS} isUserContent={false} />
    </Stage>
  )
}
