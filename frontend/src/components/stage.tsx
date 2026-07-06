import type { ReactNode } from "react"

// Stage primitives shared by Train (Marathon) and Battle, mirroring the mobile
// stage.tsx (Frosted + SlabGlow + MessageSlab). On web the frosted slab is the
// .card class (translucent white fill + backdrop blur); the glow is a static
// lamp radial-gradient overlay clipped by the card's rounded corners.

// SlabGlow equivalent: a lamp accent radial gradient at 8% alpha fading out by
// 70% of the radius (matches the mobile SlabGlow stops).
const LAMP_GLOW = "radial-gradient(circle at 50% 50%, rgb(124 111 255 / 0.08), transparent 70%)"

// A frosted slab with the lamp glow behind its content. Pass padding/gap via
// className on the inner content through `children` (callers wrap their own
// padded div), or use the convenience padding from the caller.
export function GlowCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`card relative overflow-hidden ${className}`}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: LAMP_GLOW }} />
      <div className="relative">{children}</div>
    </div>
  )
}

// Neutral message slab for empty/error/login/waiting states (the mobile MessageSlab).
export function MessageSlab({ children }: { children: ReactNode }) {
  return <div className="card px-8 py-10 flex flex-col items-center gap-3 text-center">{children}</div>
}

// Tiny mono uppercase tracked label (the mobile labelCaps; distinct from the
// sans .label-caps utility in globals.css -- Train/Battle use the mono variant).
export const LABEL_CAPS = "font-mono text-[10px] tracking-[0.15em] uppercase text-ink-muted"
