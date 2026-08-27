// Single source of truth for the 8 feed formats and their visual identity.
// Every place that needs a format color/label (feed tabs, PostCard, search
// chips, create wizard, empty states) must read from here so the accent
// system stays consistent.
//
// "Circuit" palette: muted technical inks in blue/purple tones at matched
// lightness. The accent hexes here are a hand-maintained mirror of the
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
    accent: "#cfa857",
    rgb: [207, 168, 87],
    text: "text-fmt-books",
    dot: "bg-fmt-books",
    border: "border-fmt-books",
    indicator: "bg-fmt-books",
  },
  facts: {
    id: "facts",
    label: "Facts",
    badge: "FACTS",
    accent: "#7eb1f3",
    rgb: [126, 177, 243],
    text: "text-fmt-facts",
    dot: "bg-fmt-facts",
    border: "border-fmt-facts",
    indicator: "bg-fmt-facts",
  },
  people: {
    id: "people",
    label: "People",
    badge: "PEOPLE",
    accent: "#d993ca",
    rgb: [217, 147, 202],
    text: "text-fmt-people",
    dot: "bg-fmt-people",
    border: "border-fmt-people",
    indicator: "bg-fmt-people",
  },
  concepts: {
    id: "concepts",
    label: "Ideas",
    badge: "CONCEPTS",
    accent: "#b69feb",
    rgb: [182, 159, 235],
    text: "text-fmt-concepts",
    dot: "bg-fmt-concepts",
    border: "border-fmt-concepts",
    indicator: "bg-fmt-concepts",
  },
  questions: {
    id: "questions",
    label: "Q&A",
    badge: "QUESTIONS",
    accent: "#43c3c4",
    rgb: [67, 195, 196],
    text: "text-fmt-questions",
    dot: "bg-fmt-questions",
    border: "border-fmt-questions",
    indicator: "bg-fmt-questions",
  },
  stories: {
    id: "stories",
    label: "Stories",
    badge: "STORIES",
    accent: "#eb9288",
    rgb: [235, 146, 136],
    text: "text-fmt-stories",
    dot: "bg-fmt-stories",
    border: "border-fmt-stories",
    indicator: "bg-fmt-stories",
  },
  academy: {
    id: "academy",
    label: "Academy",
    badge: "ACADEMY",
    accent: "#73c28d",
    rgb: [115, 194, 141],
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
