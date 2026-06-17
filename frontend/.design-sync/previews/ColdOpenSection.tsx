import { ColdOpenSection } from 'plexive'

// Sections render on the dark Stage inside a reading-width column; --accent is
// the post's format ink (here: stories).
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

export function Default() {
  return (
    <Stage>
      <ColdOpenSection content="On a freezing morning in 1903, two bicycle mechanics from Ohio dragged a flimsy contraption of spruce and muslin onto the dunes of Kitty Hawk - and stayed airborne for twelve seconds." />
    </Stage>
  )
}
