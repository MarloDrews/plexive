// The Priority-2 (normal case) Books cover: a fully original, cover-shaped image
// drawn in the Stage design system from a book's title and author. No external
// request, no image model, just deterministic SVG, so it scales to thousands of
// books at near-zero cost. Same book -> identical cover every time (see
// coverParams in @/lib/bookCover); different books look clearly different.
//
// Stage look by default: a dark base, a flat generative abstract pattern in the
// Books amber accent (var(--accent), fallback #cfa857) with neutral strokes, and
// the title and author in the Stage serif. Flat only, no gradients, shadows, or
// filters (IMAGE_STANDARD.md s6, SVG_STANDARD.md).
//
// Per-book borrowing: a book may pass a background color and a title font sampled
// from its real cover (the only two things borrowed, since neither is protected;
// see the generated-cover convention in IMAGE_STANDARD.md). The drawn pattern is
// always original. When the borrowed background is light, the title/author ink and
// the neutral strokes are derived for contrast so the cover still reads, even
// though the rest of the app is dark only (a cover stands in for a real book).
//
// This is app-authored markup, not content-provided SVG, so it renders as plain
// JSX (the dangerouslySetInnerHTML split in CLAUDE.md is only for content SVG).

import { useMemo } from "react"
import { coverParams, type CoverParams } from "@/lib/bookCover"

// 2:3 portrait, the cover shape. All geometry below is in this coordinate space
// and scales with the rendered box (a 64px card thumbnail or a 128px detail cover).
const W = 300
const H = 450

// The accent reads the host's --accent (set to the Books amber on the card and
// detail), falling back to the Books hex so the cover is correct even where
// --accent is not set (e.g. the my-posts list).
const ACCENT = "var(--accent, #cfa857)"

// Title fonts the app loads. The hint names one; an unknown value is passed
// through verbatim so an advanced caller can supply a raw font-family.
const FONT_MAP: Record<string, string> = {
  "cover-serif": "var(--font-cover-serif)",
  "stage-serif": "var(--font-serif)",
}

// The pattern occupies the upper band; the title block sits below an amber rule.
const BAND_TOP = 30
const BAND_BOTTOM = 250
const PAD = 30

// Map a 0..1 stream value into a range / integer, for readable geometry.
const lerp = (v: number, min: number, max: number) => min + v * (max - min)
const pickInt = (v: number, min: number, max: number) =>
  Math.floor(min + v * (max - min + 1 - 1e-9))

// Drawing palette derived from the (optional) borrowed background. On a light
// cover the strokes and ink go dark so everything reads; on the default dark
// base they keep the Stage look. The amber accent is constant in both.
interface Palette {
  base: string
  ink: string
  subInk: string
  neutral: string
  neutralSoft: string
}

// Relative luminance (0..1) of a #rgb/#rrggbb color; used only to decide whether
// a borrowed background is light or dark.
function luminance(hex: string): number {
  let h = hex.replace("#", "")
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  if (h.length !== 6) return 0
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function buildPalette(background?: string, ink?: string): Palette {
  if (background && luminance(background) > 0.6) {
    return {
      base: background,
      ink: ink ?? "#1a1a1a",
      subInk: "#6b675f",
      neutral: "#cbc7bd",
      neutralSoft: "#dcd8ce",
    }
  }
  return {
    base: background ?? "#141414", // default Stage base (matches --color-surface-1)
    ink: ink ?? "#eeeeee",
    subInk: "#8a8a8a",
    neutral: "#3a3a3a",
    neutralSoft: "#2a2a2a",
  }
}

// Greedy word-wrap into at most maxLines lines of about maxChars each, with an
// ellipsis if the text overruns. Deterministic; serif metrics are approximated
// by character count, which is enough for a cover.
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length <= maxChars || !line) {
      line = candidate
    } else {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    }
  }
  if (lines.length < maxLines && line) lines.push(line)
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    const last = lines[maxLines - 1]
    lines[maxLines - 1] = last.replace(/\s*\S*$/, "") + "…"
  }
  return lines
}

// Each flat pattern family. All return SVG elements drawn within the upper band,
// using the amber accent plus neutral strokes only.
function Pattern({ params, pal }: { params: CoverParams; pal: Palette }) {
  const v = params.values
  const cx0 = lerp(v[0], PAD + 20, W - PAD - 20)
  const cy0 = lerp(v[1], BAND_TOP + 20, BAND_BOTTOM - 20)

  switch (params.pattern) {
    case "arcs": {
      // Concentric rings sweeping from a seeded center; one or two read amber.
      const count = pickInt(v[2], 4, 6)
      const step = lerp(v[3], 24, 34)
      const amberRing = pickInt(v[4], 0, count - 1)
      const amberRing2 = pickInt(v[5], 0, count - 1)
      return (
        <g fill="none" strokeWidth={2.5}>
          {Array.from({ length: count }, (_, i) => (
            <circle
              key={i}
              cx={cx0}
              cy={cy0}
              r={20 + i * step}
              stroke={i === amberRing || i === amberRing2 ? ACCENT : pal.neutral}
            />
          ))}
        </g>
      )
    }
    case "stripes": {
      // Parallel diagonals across the band; a couple carry the accent.
      const count = pickInt(v[2], 5, 8)
      const spacing = (W - 2 * PAD) / count
      const skew = lerp(v[3], -50, 50)
      const amberA = pickInt(v[4], 0, count - 1)
      const amberB = pickInt(v[5], 0, count - 1)
      return (
        <g strokeWidth={3} strokeLinecap="round">
          {Array.from({ length: count }, (_, i) => {
            const x = PAD + i * spacing + spacing / 2
            return (
              <line
                key={i}
                x1={x}
                y1={BAND_TOP}
                x2={x + skew}
                y2={BAND_BOTTOM}
                stroke={i === amberA || i === amberB ? ACCENT : pal.neutral}
              />
            )
          })}
        </g>
      )
    }
    case "dots": {
      // A regular grid of dots; a handful are filled amber, the rest faint.
      const cols = pickInt(v[2], 4, 6)
      const rows = pickInt(v[3], 5, 7)
      const gx = (W - 2 * PAD) / (cols - 1)
      const gy = (BAND_BOTTOM - BAND_TOP) / (rows - 1)
      const dots = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c
          const amber = v[6 + (idx % 18)] > 0.78
          dots.push(
            <circle
              key={idx}
              cx={PAD + c * gx}
              cy={BAND_TOP + r * gy}
              r={amber ? 6 : 4}
              fill={amber ? ACCENT : pal.neutral}
            />
          )
        }
      }
      return <g>{dots}</g>
    }
    case "rules": {
      // Stacked horizontal rules with one thick amber band among them.
      const count = pickInt(v[2], 5, 8)
      const gap = (BAND_BOTTOM - BAND_TOP) / (count + 1)
      const amberRule = pickInt(v[3], 1, count)
      return (
        <g strokeLinecap="round">
          {Array.from({ length: count }, (_, i) => {
            const y = BAND_TOP + (i + 1) * gap
            const isAmber = i + 1 === amberRule
            const w = isAmber ? W - PAD : lerp(v[6 + (i % 16)], PAD + 40, W - PAD)
            return (
              <line
                key={i}
                x1={PAD}
                y1={y}
                x2={w}
                y2={y}
                stroke={isAmber ? ACCENT : pal.neutral}
                strokeWidth={isAmber ? 6 : 2.5}
              />
            )
          })}
        </g>
      )
    }
    case "shapes":
    default: {
      // A few offset geometric outlines, mixing the accent and neutral strokes.
      const size = lerp(v[2], 70, 120)
      const cx1 = lerp(v[6], PAD + 40, W - PAD - 40)
      const cy1 = lerp(v[7], BAND_TOP + 40, BAND_BOTTOM - 40)
      const rot = lerp(v[3], 0, 45)
      return (
        <g fill="none" strokeWidth={3} strokeLinejoin="round">
          <rect
            x={cx0 - size / 2}
            y={cy0 - size / 2}
            width={size}
            height={size}
            transform={`rotate(${rot} ${cx0} ${cy0})`}
            stroke={pal.neutral}
          />
          <circle cx={cx1} cy={cy1} r={size * 0.42} stroke={ACCENT} />
          <line
            x1={PAD}
            y1={BAND_BOTTOM - 20}
            x2={W - PAD}
            y2={BAND_TOP + 20}
            stroke={pal.neutralSoft}
            strokeWidth={2}
          />
        </g>
      )
    }
  }
}

// Approximate width of one capital in the cover serif, as a fraction of the font
// size; used only to shrink the text so a long line never overflows the cover.
const CAP_W = 0.72

// Greatest font size (capped) at which the longest line fits the text column.
function fitSize(lines: string[], cap: number, perChar: number): number {
  const longest = Math.max(1, ...lines.map((l) => l.length))
  return Math.max(13, Math.min(cap, (W - 2 * PAD) / (longest * perChar)))
}

// Short words a cover sets smaller (small caps), the way "FAST and SLOW" puts a
// small "and" between the big words.
const CONNECTORS = new Set([
  "and", "&", "or", "of", "the", "a", "an", "to", "in", "on", "for", "with", "vs", "vs.",
])
const isConnector = (w: string) => CONNECTORS.has(w.replace(/[.,;:]/g, "").toLowerCase())

// Title display lines: break at commas first (a natural title phrase break the way
// real covers do, e.g. "Thinking," / "Fast and Slow"), then wrap any long phrase.
function splitTitleLines(title: string, maxChars: number, maxLines: number): string[] {
  const phrases = title.split(",").map((s) => s.trim()).filter(Boolean)
  const out: string[] = []
  phrases.forEach((p, i) => {
    const phrase = i < phrases.length - 1 ? `${p},` : p
    if (phrase.length <= maxChars) out.push(phrase)
    else for (const l of wrapText(phrase, maxChars, maxLines)) out.push(l)
  })
  return out.slice(0, maxLines)
}

// Effective width of a line in character units, counting connector words narrower
// (they render smaller), so the title is not shrunk more than necessary.
function lineWidth(line: string, connectorScale: number): number {
  return line
    .split(/\s+/)
    .reduce((n, w, i) => n + (i > 0 ? 1 : 0) + w.length * (isConnector(w) ? connectorScale : 1), 0)
}

// The "real cover" layout: text only, nothing else. The title is centered in the
// upper third, broken at commas and with connector words ("and", "of", ...) set
// smaller the way covers do; the author is centered below. Both in the borrowed
// (similar) typeface. Used when a book borrows a real cover's background, so the
// generated cover evokes it. font-family goes through style so the CSS var resolves
// in the browser.
function CoverText({
  title,
  author,
  pal,
  fontFamily,
}: {
  title: string
  author: string
  pal: Palette
  fontFamily: string
}) {
  const connectorScale = 0.62
  // Pure functions of the title/author; memoized so wide feed re-renders do
  // not re-run the wrapping per books card.
  const lines = useMemo(() => splitTitleLines(title, 16, 4), [title])
  const authorLines = useMemo(() => wrapText(author, 18, 2), [author])
  const widest = Math.max(1, ...lines.map((l) => lineWidth(l, connectorScale)))
  const titleSize = Math.max(14, Math.min(32, (W - 2 * PAD) / (widest * CAP_W)))
  const connectorSize = Math.round(titleSize * connectorScale)
  const titleLead = titleSize * 1.22
  // Vertically center the title block on ~33% of the height.
  const titleBase = H * 0.33 - ((lines.length - 1) * titleLead) / 2 + titleSize * 0.34

  const authorSize = fitSize(authorLines, 16, CAP_W * 0.92)
  const authorLead = authorSize * 1.2
  const authorBase = H * 0.7

  const fam = `${fontFamily}, Georgia, serif`
  return (
    <>
      <text
        textAnchor="middle"
        xmlSpace="preserve"
        style={{ fontFamily: fam, letterSpacing: "0.06em" }}
        fontSize={titleSize}
        fontWeight={500}
        fill={pal.ink}
      >
        {lines.map((line, li) => (
          <tspan
            key={li}
            x={W / 2}
            y={li === 0 ? titleBase : undefined}
            dy={li === 0 ? 0 : titleLead}
          >
            {line.split(/\s+/).map((w, wi) => (
              <tspan key={wi} fontSize={isConnector(w) ? connectorSize : titleSize}>
                {wi > 0 ? ` ${w}` : w}
              </tspan>
            ))}
          </tspan>
        ))}
      </text>
      <text
        x={W / 2}
        y={authorBase}
        textAnchor="middle"
        style={{ fontFamily: fam, letterSpacing: "0.12em" }}
        fontSize={authorSize}
        fontWeight={500}
        fill={pal.ink}
      >
        {authorLines.map((line, i) => (
          <tspan key={i} x={W / 2} dy={i === 0 ? 0 : authorLead}>
            {line}
          </tspan>
        ))}
      </text>
    </>
  )
}

interface Props {
  title: string
  author: string
  className?: string
  // Optional per-book borrowing from the real cover (color + typeface only).
  background?: string
  ink?: string
  titleFont?: string
}

export default function GeneratedBookCover({
  title,
  author,
  className,
  background,
  ink,
  titleFont,
}: Props) {
  // Deterministic in (background, ink); memoized so wide feed re-renders do
  // not re-derive the palette per books card.
  const pal = useMemo(() => buildPalette(background, ink), [background, ink])
  const titleFontFamily =
    (titleFont && (FONT_MAP[titleFont] ?? titleFont)) || "var(--font-serif)"
  // A borrowed background means the book evokes a real cover: render text only,
  // placed like the real cover, no pattern or rules. Otherwise draw the original
  // generative Stage cover.
  const coverText = !!background

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      // Decision 12: every call site renders the title (and usually the author)
      // as text beside the cover, so naming the cover would read them twice.
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect x={0} y={0} width={W} height={H} fill={pal.base} />

      {coverText ? (
        <CoverText title={title} author={author} pal={pal} fontFamily={titleFontFamily} />
      ) : (
        <StageArt title={title} author={author} pal={pal} fontFamily={titleFontFamily} />
      )}
    </svg>
  )
}

// The original generative Stage cover: a flat abstract pattern plus a left-aligned
// title and author. Used for books that do not borrow a real cover's look.
function StageArt({
  title,
  author,
  pal,
  fontFamily,
}: {
  title: string
  author: string
  pal: Palette
  fontFamily: string
}) {
  // Seed hash + ~24 PRNG draws + text wrapping are pure in (title, author);
  // memoized so they run once per book, not on every re-render.
  const params = useMemo(() => coverParams(title, author), [title, author])
  const titleLines = useMemo(() => wrapText(title, 16, 4), [title])
  const authorLines = useMemo(() => wrapText(author, 22, 2), [author])
  const titleSize = 26
  const titleLead = 30
  const titleBottom = 372
  const titleTop = titleBottom - (titleLines.length - 1) * titleLead

  return (
    <>
      <Pattern params={params} pal={pal} />

      {/* Amber rule dividing the pattern band from the title block. */}
      <line x1={PAD} y1={272} x2={W - PAD} y2={272} stroke={ACCENT} strokeWidth={2} />

      <text
        x={PAD}
        y={titleTop}
        // font-family is set via style (CSS), not the SVG presentation attribute,
        // because browsers do not resolve var() inside SVG attributes; the var
        // would silently fall back to the generic serif otherwise.
        style={{ fontFamily: `${fontFamily}, Georgia, serif` }}
        fontSize={titleSize}
        fontWeight={500}
        fill={pal.ink}
      >
        {titleLines.map((line, i) => (
          <tspan key={i} x={PAD} dy={i === 0 ? 0 : titleLead}>
            {line}
          </tspan>
        ))}
      </text>

      <text
        x={PAD}
        y={titleBottom + 34}
        style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
        fontSize={15}
        fontStyle="italic"
        fill={pal.subInk}
      >
        {authorLines.map((line, i) => (
          <tspan key={i} x={PAD} dy={i === 0 ? 0 : 20}>
            {line}
          </tspan>
        ))}
      </text>
    </>
  )
}
