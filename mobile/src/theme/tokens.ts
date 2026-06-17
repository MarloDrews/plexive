// Circuit design tokens, ported from frontend/src/app/globals.css (@theme).
// That file is the single source of truth; these constants mirror it for
// React Native. tailwind.config.js imports this object so NativeWind classes
// (bg-surface-1, text-ink-dim, rounded-card, ...) match the web vocabulary,
// and components import it directly where a raw hex is needed (SVG, shadows).

export const colors = {
  // Surfaces — neutral dark, no color tint
  "surface-0": "#0a0a0a", // page base
  "surface-1": "#141414", // cards, panels
  "surface-2": "#1a1a1a", // inputs, inner blocks
  "surface-3": "#222222", // raised elements
  "surface-overlay": "rgba(10, 10, 10, 0.95)", // bars, sheets

  // Edges — neutral gray hairlines
  edge: "rgba(200, 200, 200, 0.10)",
  "edge-strong": "rgba(200, 200, 200, 0.20)",

  // Ink (text)
  ink: "#eeeeee", // headings, primary
  "ink-body": "#c5c5c5", // body prose
  "ink-dim": "#8a8a8a", // secondary
  "ink-muted": "#606060", // labels, meta
  "ink-faint": "#3a3a3a", // fine print

  // Brand + semantic
  lamp: "#7c6fff", // brand accent
  like: "#ff3a5c",
  save: "#f5c542",
  good: "#6abf84",
  bad: "#c05870",

  // Format inks — mobile source of truth for format colors. src/lib/formats.ts
  // derives each format's accent + rgb from these. Keep in sync by hand with
  // --color-fmt-* in frontend/src/app/globals.css.
  "fmt-books": "#6b9eff",
  "fmt-facts": "#5bc8bc",
  "fmt-people": "#c47dcc",
  "fmt-concepts": "#9b8ae0",
  "fmt-questions": "#72bb80",
  "fmt-stories": "#8a88e8",
  "fmt-academy": "#5ba8e0",
  "fmt-neutral": "#7888a8",
} as const

// Stage translucent white fills (web globals.css layers these over the
// neutral surfaces instead of opaque surface steps).
export const fills = {
  slab: "rgba(255, 255, 255, 0.04)", // .card slabs, loading slabs
  chrome: "rgba(255, 255, 255, 0.06)", // chrome pills, inputs, icon circles
  tag: "rgba(255, 255, 255, 0.05)", // feed interest tag pills
  active10: "rgba(255, 255, 255, 0.10)", // sliding indicator, send button
  active12: "rgba(255, 255, 255, 0.12)", // selected segment, active nav circle
  dotOff: "rgba(255, 255, 255, 0.15)", // empty difficulty dots
} as const

// Radii in px (web: 0.875rem / 0.625rem / 1.25rem at 16px root;
// Stage slabs and sheets use rounded-3xl = 24px)
export const radius = {
  card: 14,
  field: 10,
  sheet: 20,
  slab: 24,
} as const

// Font family names as registered with expo-font in app/_layout.tsx.
// Web mapping: font-serif = Newsreader, font-sans = Source Sans 3,
// font-mono = Geist Mono.
export const fonts = {
  serif: "Newsreader_400Regular",
  serifMedium: "Newsreader_500Medium",
  serifItalic: "Newsreader_400Regular_Italic",
  sans: "SourceSans3_400Regular",
  sansMedium: "SourceSans3_500Medium",
  sansSemiBold: "SourceSans3_600SemiBold",
  mono: "GeistMono_400Regular",
} as const
