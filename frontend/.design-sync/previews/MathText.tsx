import { MathText } from 'plexive'

// Text-heavy preview: also the font check. prose-post is the serif reading
// voice (Newsreader); inline $...$ spans are typeset by KaTeX.
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: -24,
        padding: 40,
        boxSizing: 'border-box',
        background: 'var(--color-surface-0)',
        color: 'var(--color-ink)',
        minHeight: 140,
      }}
    >
      <div style={{ maxWidth: 460 }}>{children}</div>
    </div>
  )
}

export function InlineMath() {
  return (
    <Stage>
      <p className="prose-post">
        <MathText text="The area of a circle is $A = \pi r^2$, where $r$ is the radius. Doubling the radius quadruples the area." />
      </p>
    </Stage>
  )
}

export function Equation() {
  return (
    <Stage>
      <p className="prose-post">
        <MathText text="Euler's identity, $e^{i\pi} + 1 = 0$, ties together five fundamental constants in a single line." />
      </p>
    </Stage>
  )
}
