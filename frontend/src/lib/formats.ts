// Single source of truth for the 8 feed formats and their visual identity.
// Every place that needs a format color/label (feed tabs, PostCard, search
// chips, create wizard, empty states) must read from here so the accent
// system stays consistent.

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
  // Accent color as hex and RGB triple (for canvas/gradient interpolation).
  accent: string
  rgb: readonly [number, number, number]
  // Tailwind utility classes for the accent.
  text: string
  dot: string
  border: string
  indicator: string
  // Card backdrop treatments (PostCard).
  glow: string
  radial: string
}

export const FORMAT_STYLES: Record<FormatId, FormatStyle> = {
  books: {
    id: "books",
    label: "Books",
    badge: "BOOKS",
    accent: "#fbbf24",
    rgb: [251, 191, 36],
    text: "text-amber-400",
    dot: "bg-amber-400",
    border: "border-amber-400",
    indicator: "bg-amber-400",
    glow: "from-amber-600/40",
    radial: "rgba(251,191,36,0.09)",
  },
  facts: {
    id: "facts",
    label: "Facts",
    badge: "FACTS",
    accent: "#22d3ee",
    rgb: [34, 211, 238],
    text: "text-cyan-400",
    dot: "bg-cyan-400",
    border: "border-cyan-400",
    indicator: "bg-cyan-400",
    glow: "from-cyan-500/40",
    radial: "rgba(34,211,238,0.09)",
  },
  people: {
    id: "people",
    label: "People",
    badge: "PEOPLE",
    accent: "#fb7185",
    rgb: [251, 113, 133],
    text: "text-rose-400",
    dot: "bg-rose-400",
    border: "border-rose-400",
    indicator: "bg-rose-400",
    glow: "from-rose-500/40",
    radial: "rgba(251,113,133,0.09)",
  },
  concepts: {
    id: "concepts",
    label: "Ideas",
    badge: "CONCEPTS",
    accent: "#a78bfa",
    rgb: [167, 139, 250],
    text: "text-violet-400",
    dot: "bg-violet-400",
    border: "border-violet-400",
    indicator: "bg-violet-400",
    glow: "from-violet-500/40",
    radial: "rgba(167,139,250,0.09)",
  },
  questions: {
    id: "questions",
    label: "Q&A",
    badge: "QUESTIONS",
    accent: "#34d399",
    rgb: [52, 211, 153],
    text: "text-emerald-400",
    dot: "bg-emerald-400",
    border: "border-emerald-400",
    indicator: "bg-emerald-400",
    glow: "from-emerald-500/40",
    radial: "rgba(52,211,153,0.09)",
  },
  stories: {
    id: "stories",
    label: "Stories",
    badge: "STORIES",
    accent: "#fb923c",
    rgb: [251, 146, 60],
    text: "text-orange-400",
    dot: "bg-orange-400",
    border: "border-orange-400",
    indicator: "bg-orange-400",
    glow: "from-orange-500/40",
    radial: "rgba(251,146,60,0.09)",
  },
  academy: {
    id: "academy",
    label: "Academy",
    badge: "ACADEMY",
    accent: "#818cf8",
    rgb: [129, 140, 248],
    text: "text-indigo-400",
    dot: "bg-indigo-400",
    border: "border-indigo-400",
    indicator: "bg-indigo-400",
    glow: "from-indigo-500/40",
    radial: "rgba(129,140,248,0.09)",
  },
}

// Neutral fallback for unknown formats (keeps rendering safe).
export const FALLBACK_FORMAT_STYLE: FormatStyle = {
  id: "facts",
  label: "Post",
  badge: "POST",
  accent: "#a1a1aa",
  rgb: [161, 161, 170],
  text: "text-zinc-400",
  dot: "bg-zinc-400",
  border: "border-zinc-400",
  indicator: "bg-zinc-400",
  glow: "from-zinc-500/40",
  radial: "rgba(161,161,170,0.09)",
}

export function formatStyle(format: string): FormatStyle {
  return FORMAT_STYLES[format as FormatId] ?? FALLBACK_FORMAT_STYLE
}
