import { SvgBlock } from 'plexive'

// A seed-content diagram (isUserContent=false renders inline). Strokes use
// currentColor so SvgBlock's `color` prop tints the whole figure.
const DIAGRAM = `<svg viewBox="0 0 240 120" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="40" cy="60" r="22"/>
  <circle cx="200" cy="60" r="22"/>
  <line x1="62" y1="60" x2="178" y2="60"/>
  <path d="M168 52l10 8-10 8"/>
  <text x="40" y="64" font-size="11" text-anchor="middle" fill="currentColor" stroke="none">cause</text>
  <text x="200" y="64" font-size="11" text-anchor="middle" fill="currentColor" stroke="none">effect</text>
</svg>`

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        margin: -24,
        padding: 40,
        boxSizing: 'border-box',
        background: 'var(--color-surface-0)',
        color: 'var(--color-ink)',
        minHeight: 160,
      }}
    >
      {children}
    </div>
  )
}

// Default ink (a soft cool gray, the seed-visual color).
export function Seed() {
  return (
    <Stage>
      <SvgBlock svg={DIAGRAM} isUserContent={false} className="max-w-[280px] mx-auto" />
    </Stage>
  )
}

// Tinted to a format accent via the color prop.
export function Tinted() {
  return (
    <Stage>
      <SvgBlock svg={DIAGRAM} isUserContent={false} className="max-w-[280px] mx-auto" color="#6b9eff" />
    </Stage>
  )
}
