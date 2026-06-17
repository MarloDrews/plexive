# Plexive design-sync notes

Plexive (the app formerly called "Deepscroll") is a **Next.js app, not a
component library**, so this import is off the converter's normal path. The
durable inputs are committed under `.design-sync/`; regenerable build inputs
live in the gitignored `.design-sync/build/`.

## How the build works (run before the converter)

1. `node .design-sync/build-inputs.mjs` regenerates everything the converter
   consumes into `.design-sync/build/`:
   - `entry.mjs` — a **named re-export barrel** of every component's *default*
     export (esbuild's `export *` synth-entry can't see default exports). It
     imports `process-shim.mjs` first so `Avatar`'s top-level `process.env` read
     does not crash the browser IIFE.
   - `styles.compiled.css` — Tailwind v4 compiled via `@tailwindcss/postcss`
     (scanning `src` + `.design-sync/previews`), prefixed with the brand
     `@font-face` block, suffixed with KaTeX's stylesheet. This is `cfg.cssEntry`.
   - `fonts/` — Newsreader / Source Sans 3 / Geist Mono (fontsource CDN) + the 20
     KaTeX woff2 faces.
2. Then `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --out ./ds-bundle`
   and `node .ds-sync/package-validate.mjs ./ds-bundle`.

## Decisions / gotchas

- **Excluded components**: `PostRow` (hard `next/navigation` router dep) and
  `SectionRenderer` (a full-post dispatcher, not a reusable primitive) are absent
  from `componentSrcMap`. `QuizSection` is imported but ships a floor card (it
  needs `useAuth` + data fetch).
- **Dark DS on a white card**: the preview card template (`emit.mjs`) hardcodes a
  white body; its floor card is light-themed and reads fine on white. Authored
  previews therefore bring their own full-bleed **dark Stage wrapper**
  (`margin:-24; background: var(--color-surface-0)`). Do NOT force `body` dark
  globally — it would make the light floor-card text invisible.
- **Props**: there is no shipped `.d.ts`; component props are local `interface
  Props`, so the converter emits `{[key]: unknown}`. The 20 authored components
  have correct contracts via `cfg.dtsPropsFor` (hand-maintained — see below).
- **KaTeX**: shipped (css + 20 woff2) so `MathText` and the math sections typeset
  real LaTeX. `src` references it via `katex.renderToString`.

## Known render warns (triaged as legitimate)

- `Spinner` is intrinsically tiny (a small loading ring) — a `[RENDER_THIN]`-style
  small render is correct, not a defect.
- Unauthored section floor cards that auto-render a faint label on white (e.g.
  `BiggerPictureSection`, `RobustnessSection`, `SetupSection`, `SurprisesSection`)
  render real content with empty props; expected until authored.

## Re-sync risks (watch-list)

- `.design-sync/build/` is gitignored and **must be regenerated** by
  `build-inputs.mjs` on a fresh clone — and fonts are fetched from the fontsource
  CDN (needs network; pins `@latest`, so face versions can drift).
- `cfg.componentSrcMap` is generated once from `src/components`; **new components
  added to the app are not picked up automatically** — regenerate the map (see
  the snippet in git history) or add entries by hand.
- `cfg.dtsPropsFor` is hand-written for the 20 authored components. If a
  component's real props change in `src`, the contract here goes stale silently —
  re-check against source on any meaningful re-sync.
- Authored previews import format-ink hexes inline (e.g. `#6b9eff`). The source of
  truth is `src/lib/formats.ts`; if those inks change, update the previews.
- The white-card / dark-Stage workaround depends on `emit.mjs` keeping the white
  body default. If a future converter changes the card canvas, revisit the Stage
  wrappers.
