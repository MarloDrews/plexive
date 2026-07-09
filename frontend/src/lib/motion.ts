// Reduced-motion helpers for programmatic scrolling.
//
// The CSS animation system is already guarded by @media (prefers-reduced-motion)
// blocks in globals.css, but a scroll issued from JavaScript ignores those and
// always animates (A11Y-025). These read the media query at call time rather
// than caching it, so a user who flips the OS setting mid-session is respected
// without a reload.
//
// Marathon.tsx and Battle.tsx each carry their own useReducedMotion hook for
// animation gating; consolidating them onto prefersReducedMotion is M017.

export function prefersReducedMotion(): boolean {
  // Guard for SSR, where matchMedia does not exist.
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

// Resolves a requested scroll behavior against the user's motion preference:
// "smooth" becomes an instant jump when reduced motion is on. Anything already
// instant passes through untouched.
//
// "auto" means "defer to the CSS scroll-behavior property", which this app
// never sets, so it lands on an instant jump. If a scroll-behavior: smooth rule
// is ever added, return "instant" here instead.
export function scrollBehavior(preferred: ScrollBehavior = "smooth"): ScrollBehavior {
  if (preferred === "smooth" && prefersReducedMotion()) return "auto"
  return preferred
}
