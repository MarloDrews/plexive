// Single source of truth for the feed formats and their visual identity,
// ported from frontend/src/lib/formats.ts. The web file also carries Tailwind
// utility class strings per format; those are dropped here — React Native
// styles use the accent hex directly.
//
// "Circuit" palette: the per-format accent hex and rgb triple are NOT hardcoded
// here. They derive from the fmt-* inks in src/theme/tokens.ts (the mobile
// source of truth for format colors, mirroring --color-fmt-* in
// frontend/src/app/globals.css), so the value lives in one place per platform.

import { colors } from "../theme/tokens"

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
}

// Parse a "#rrggbb" token into its decimal RGB triple.
function hexToRgb(hex: string): readonly [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}

// Pull a format ink from the theme tokens and expose it as accent + rgb.
function ink(key: `fmt-${FormatId}` | "fmt-neutral") {
  const accent = colors[key]
  return { accent, rgb: hexToRgb(accent) }
}

export const FORMAT_STYLES: Record<FormatId, FormatStyle> = {
  books: { id: "books", label: "Books", badge: "BOOKS", ...ink("fmt-books") },
  facts: { id: "facts", label: "Facts", badge: "FACTS", ...ink("fmt-facts") },
  people: { id: "people", label: "People", badge: "PEOPLE", ...ink("fmt-people") },
  concepts: { id: "concepts", label: "Ideas", badge: "CONCEPTS", ...ink("fmt-concepts") },
  questions: { id: "questions", label: "Q&A", badge: "QUESTIONS", ...ink("fmt-questions") },
  stories: { id: "stories", label: "Stories", badge: "STORIES", ...ink("fmt-stories") },
  academy: { id: "academy", label: "Academy", badge: "ACADEMY", ...ink("fmt-academy") },
}

// Neutral fallback for unknown formats (keeps rendering safe).
export const FALLBACK_FORMAT_STYLE: FormatStyle = {
  id: "facts",
  label: "Post",
  badge: "POST",
  ...ink("fmt-neutral"),
}

export function formatStyle(format: string): FormatStyle {
  return FORMAT_STYLES[format as FormatId] ?? FALLBACK_FORMAT_STYLE
}

// Render-time SVG re-paletting: seed content SVGs were authored against the
// pre-redesign accent hexes. SafeSvg rewrites them to the current inks so
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
