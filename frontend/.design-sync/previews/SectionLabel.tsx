import { SectionLabel } from 'plexive'

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: -24,
        padding: 40,
        boxSizing: 'border-box',
        background: 'var(--color-surface-0)',
        color: 'var(--color-ink)',
        fontFamily: 'var(--font-source-sans)',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        minHeight: 120,
      }}
    >
      {children}
    </div>
  )
}

// The muted default — the editorial micro-label that heads every post section.
export function Default() {
  return (
    <Stage>
      <SectionLabel>Key Findings</SectionLabel>
      <SectionLabel>The Big Idea</SectionLabel>
    </Stage>
  )
}

// With a format-accent color (color is a utility class name).
export function Accent() {
  return (
    <Stage>
      <SectionLabel color="text-fmt-books">From the Book</SectionLabel>
      <SectionLabel color="text-fmt-questions">The Question</SectionLabel>
    </Stage>
  )
}
