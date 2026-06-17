import { StorySection } from 'plexive'

function Stage({ children, accent = '#8a88e8' }: { children: React.ReactNode; accent?: string }) {
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

// Narrative prose followed by "key figures" cards (name, lifespan, role, line).
const STORY = {
  body: 'In 1928, Alexander Fleming returned from holiday to a cluttered lab and a stack of petri dishes he had forgotten to clean. One had grown a mould - and around it, a clear ring where the bacteria had simply died. Most people would have washed the dish. Fleming looked closer, and named the substance penicillin.',
  key_figures: [
    {
      name: 'Alexander Fleming',
      role: 'Discovered penicillin',
      lifespan: '1881-1955',
      one_line: 'A Scottish bacteriologist whose tidiness, or lack of it, changed medicine forever.',
    },
    {
      name: 'Howard Florey',
      role: 'Turned it into a drug',
      lifespan: '1898-1968',
      one_line: 'Led the Oxford team that purified penicillin into a usable, life-saving treatment.',
    },
  ],
}

export function Default() {
  return (
    <Stage>
      <StorySection content={STORY} isUserContent={false} />
    </Stage>
  )
}
