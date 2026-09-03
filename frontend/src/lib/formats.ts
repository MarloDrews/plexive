// Single source of truth for the 7 feed formats and their visual identity
// (7, from FORMAT_IDS below).
// Every place that needs a format color/label (feed tabs, PostCard, search
// chips, create wizard, empty states) must read from here so the accent
// system stays consistent.
//
// Format inks, rebased 2026-09-03: saturated, chosen on a specimen against the
// #0D0F17 ground. They keep the seven OKLCH hues of the muted "Circuit" set
// they replace and drop its matched lightness (that set was L=0.75, C=0.110 for
// all seven; these span L 0.636-0.693, C 0.105-0.295).
// These hexes are a hand-maintained mirror of the
// --color-fmt-* tokens in globals.css (web source of truth); update both
// together. No client outside the web app carries these colors today, so one
// that adds format colors mirrors globals.css too. The Tailwind classes below
// reference the globals.css tokens. Inside post rendering the active ink is
// exposed as the CSS variable --accent on the container.

export const FORMAT_IDS = [
  "books",
  "facts",
  "people",
  "concepts",
  "questions",
  "stories",
  "academy",
] as const

export type FormatId = (typeof FORMAT_IDS)[number]

export interface FormatStyle {
  id: FormatId
  // Display name used across the app (feed tabs, chips, wizard).
  label: string
  // Uppercase badge text shown on cards and detail pages.
  badge: string
  // Accent ink as hex and RGB triple (for SVG remap/canvas interpolation).
  accent: string
  rgb: readonly [number, number, number]
  // Tailwind utility classes for the accent (generated from fmt-* tokens).
  text: string
  dot: string
  border: string
  indicator: string
}

export const FORMAT_STYLES: Record<FormatId, FormatStyle> = {
  books: {
    id: "books",
    label: "Books",
    badge: "BOOKS",
    accent: "#B78915",
    rgb: [183, 137, 21],
    text: "text-fmt-books",
    dot: "bg-fmt-books",
    border: "border-fmt-books",
    indicator: "bg-fmt-books",
  },
  facts: {
    id: "facts",
    label: "Facts",
    badge: "FACTS",
    accent: "#3490FF",
    rgb: [52, 144, 255],
    text: "text-fmt-facts",
    dot: "bg-fmt-facts",
    border: "border-fmt-facts",
    indicator: "bg-fmt-facts",
  },
  people: {
    id: "people",
    label: "People",
    badge: "PEOPLE",
    accent: "#FF22E3",
    rgb: [255, 34, 227],
    text: "text-fmt-people",
    dot: "bg-fmt-people",
    border: "border-fmt-people",
    indicator: "bg-fmt-people",
  },
  concepts: {
    id: "concepts",
    label: "Ideas",
    badge: "CONCEPTS",
    accent: "#A774FF",
    rgb: [167, 116, 255],
    text: "text-fmt-concepts",
    dot: "bg-fmt-concepts",
    border: "border-fmt-concepts",
    indicator: "bg-fmt-concepts",
  },
  questions: {
    id: "questions",
    label: "Q&A",
    badge: "QUESTIONS",
    accent: "#1AA0A1",
    rgb: [26, 160, 161],
    text: "text-fmt-questions",
    dot: "bg-fmt-questions",
    border: "border-fmt-questions",
    indicator: "bg-fmt-questions",
  },
  stories: {
    id: "stories",
    label: "Stories",
    badge: "STORIES",
    accent: "#FF534B",
    rgb: [255, 83, 75],
    text: "text-fmt-stories",
    dot: "bg-fmt-stories",
    border: "border-fmt-stories",
    indicator: "bg-fmt-stories",
  },
  academy: {
    id: "academy",
    label: "Academy",
    badge: "ACADEMY",
    accent: "#1AA55D",
    rgb: [26, 165, 93],
    text: "text-fmt-academy",
    dot: "bg-fmt-academy",
    border: "border-fmt-academy",
    indicator: "bg-fmt-academy",
  },
}

// Neutral fallback for unknown formats (keeps rendering safe).
export const FALLBACK_FORMAT_STYLE: FormatStyle = {
  id: "facts",
  label: "Post",
  badge: "POST",
  accent: "#7e8699",
  rgb: [126, 134, 153],
  text: "text-fmt-neutral",
  dot: "bg-fmt-neutral",
  border: "border-fmt-neutral",
  indicator: "bg-fmt-neutral",
}

export function formatStyle(format: string): FormatStyle {
  return FORMAT_STYLES[format as FormatId] ?? FALLBACK_FORMAT_STYLE
}

// Render-time SVG re-paletting: seed content SVGs were authored against the
// pre-redesign accent hexes. SvgBlock rewrites them to the current inks so
// post visuals match the identity without ever editing content JSON.
export const LEGACY_SVG_ACCENT_MAP: Record<string, string> = {
  "#fbbf24": FORMAT_STYLES.books.accent,
  "#22d3ee": FORMAT_STYLES.facts.accent,
  "#fb7185": FORMAT_STYLES.people.accent,
  "#a78bfa": FORMAT_STYLES.concepts.accent,
  "#34d399": FORMAT_STYLES.questions.accent,
  "#fb923c": FORMAT_STYLES.stories.accent,
  "#818cf8": FORMAT_STYLES.academy.accent,
}
