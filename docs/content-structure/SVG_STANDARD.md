# Deepscroll — SVG Design Standard

The binding template for every inline SVG graphic in Deepscroll. Goal: hundreds
of graphics that feel like one set across the whole feed, carry topic-specific
meaning, and sit natively on the app's "Stage" design.

This file governs **how a graphic looks** (its technical authoring rules). It
does not decide **where** a graphic sits in a post or **how many** a post gets:
that belongs to each format's skeleton (`*_skeleton.jsonc`, the `VISUAL PLAN`
block). It does not govern caption or label wording: that follows
`STYLE_GUIDE_LONGFORM.md`. Stay in this lane.

Two uses:
1. Reference while generating SVGs (Deep Research / generation).
2. Reference for Claude Code so the frontend embeds them correctly and future
   contributors match the style.

---

## 1. Technical base rules (every SVG)

- **viewBox is always `0 0 400 300`.** Draw nothing outside the box. Edge
  labels need at least 8px inner padding or they clip.
- **No `width`/`height` on `<svg>`.** Only the viewBox. The frontend controls
  size with CSS.
- **Background always transparent.** No `<rect>` behind the drawing. The
  frosted Stage slab shows through.
- **`fill="none"` on the root `<svg>`** as default. Fill only where a filled
  area is deliberate, and then sparingly (see accent rule).
- **Flat only.** No shadows, no filters, no 3D, no gradients inside shapes.
- **Strokes by default, not fills.** Strokes read lighter on the near-black
  base and match the UI's line-drawn feel.
- **`stroke-width` 2 to 2.5** for main elements, 1.5 to 2 for helper lines.
  This matches the app's icon stroke weight, so diagrams look native.
- **`stroke-linecap="round"` and `stroke-linejoin="round"` everywhere.** Soft,
  modern, consistent with Stage's rounded geometry.
- **Corner radius on boxes: `rx` 12 or more.** Stage uses large, soft radii
  (24px slabs, fully round pills). Sharp or barely-rounded rectangles look
  foreign. Use fully round ends for pill or capsule shapes. Thin data-chart
  bars are the exception: give them a small radius (about 4 to 8) so they
  still read as bars.
- **Type:** label text uses `font-family="var(--font-sans), system-ui,
  sans-serif"`; numbers and units inside a diagram use `var(--font-mono),
  ui-monospace, monospace`. `font-weight` 600 to 700 for labels. `font-size`
  13 to 16, never below 13: the 400-wide viewBox is scaled down on a phone, so
  anything smaller turns unreadable. Use 15 to 16 for the primary label or key
  number, 13 to 14 for secondary labels and axes. Keep every label to 1 or 2 words.
- **`text-anchor="middle"`** for centered labels. Position edge labels
  deliberately and keep them inside the box.

---

## 2. Color roles

Every SVG separates exactly two color roles. This is the rule that keeps the
whole feed coherent.

- **Neutral elements** (text, helper lines, structural lines, arrows): always
  **`currentColor`**. It inherits the app's text color (`--color-ink`,
  `#eeeeee`), so graphics match the surrounding type. Use `opacity` 0.4 to 0.7
  on helper lines so they sit behind the main shapes.
- **The one accent element** (the single highlighted core of the statement):
  **`var(--accent)`**. The post container exposes the active format color as
  `--accent` at runtime, so the graphic is automatically the right color for
  its format with no hardcoded hex. Use the accent on one element only; if
  everything is accented, nothing is.

The app is **dark only** at present (no light/white mode). `currentColor` is
still the rule: it keeps neutral elements locked to the app's text color, and
it keeps the graphics ready if a light mode is ever added, with no
regeneration.

When authoring an SVG **outside** a post container (a preview, a test), give
the accent a fallback: `var(--accent, #6e9cd8)` using the format hex from the
table below. Inside a real post, `var(--accent)` alone resolves correctly.

---

## 3. Accent colors per format

The runtime `--accent` resolves to these Stage values. Use the hex only as a
fallback or when previewing outside a post. These are intentionally muted, not
neon; do not brighten or saturate them.

| Format    | Hex       | RGB (for the glow) | Token                   |
|-----------|-----------|--------------------|-------------------------|
| books     | `#dfc186` | `223 193 134`      | `--color-fmt-books`     |
| facts     | `#6e9cd8` | `110 156 216`      | `--color-fmt-facts`     |
| people    | `#dd7eca` | `221 126 202`      | `--color-fmt-people`    |
| concepts  | `#9e7edd` | `158 126 221`      | `--color-fmt-concepts`  |
| questions | `#8ae0e0` | `138 224 224`      | `--color-fmt-questions` |
| stories   | `#db8076` | `219 128 118`      | `--color-fmt-stories`   |
| academy   | `#7edd9e` | `126 221 158`      | `--color-fmt-academy`   |
| neutral   | `#7e8699` | `126 134 153`      | `--color-fmt-neutral`   |

---

## 4. Matching the Stage look

Stage is borderless frosted slabs (`rgb(255 255 255 / 0.04)`, 24px blur, 24px
radius) floating on a near-black base (`#0a0a0a`) with a faint dot grid. A
graphic sits on that translucent slab. To look native:

- Let the slab show through: transparent background, no fills behind the art.
- Match the soft geometry: rounded line ends, `rx` 12 or more, no hard corners.
- Match the line weight: stroke 2 to 2.5, the same visual weight as the UI
  icons, so a diagram does not look heavier than the chrome around it.
- Keep the accent quiet: one muted accent element, everything else
  `currentColor`. Accent in Stage marks the one thing that matters, never the
  whole picture.
- Keep it sparse. The near-black base and thin light strokes are the aesthetic.
  Crowded, heavy diagrams fight the design.

---

## 5. Diagram toolbox

Six standard types cover most needs. The `visual_type` field names the type.
**Not a hard boundary:** if no type fits, build a free SVG, as long as it obeys
sections 1 to 4. All examples use `var(--accent)` for the accent element; they
render correctly inside any post regardless of format.

### 5.1 `cycle` — repeating process
For loops (e.g. Habit Loop: Cue, Routine, Reward).

```svg
<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" fill="none">
  <g stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round">
    <circle cx="200" cy="70" r="42"/>
    <circle cx="110" cy="215" r="42"/>
    <circle cx="290" cy="215" r="42"/>
  </g>
  <g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.55">
    <path d="M168 108 Q120 140 96 178"/>
    <path d="M96 178 l-3 -14 m3 14 l13 -6"/>
    <path d="M152 230 Q200 250 248 230"/>
    <path d="M248 230 l-13 -5 m13 5 l-2 14"/>
    <path d="M304 178 Q280 140 232 108"/>
    <path d="M232 108 l14 2 m-14 -2 l5 13"/>
  </g>
  <g fill="currentColor" font-family="var(--font-sans), system-ui, sans-serif" font-size="14" font-weight="600" text-anchor="middle">
    <text x="200" y="75">Cue</text>
    <text x="110" y="220">Routine</text>
    <text x="290" y="220">Reward</text>
  </g>
</svg>
```

### 5.2 `flow` — sequence / arrow chain
For linear steps or cause and effect (e.g. First Principles: Assume, Break
down, Rebuild).

```svg
<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" fill="none">
  <g stroke="var(--accent)" stroke-width="2.5">
    <rect x="30" y="120" width="90" height="60" rx="14"/>
    <rect x="155" y="120" width="90" height="60" rx="14"/>
    <rect x="280" y="120" width="90" height="60" rx="14"/>
  </g>
  <g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.55">
    <path d="M120 150 h35"/>
    <path d="M155 150 l-12 -6 m12 6 l-12 6"/>
    <path d="M245 150 h35"/>
    <path d="M280 150 l-12 -6 m12 6 l-12 6"/>
  </g>
  <g fill="currentColor" font-family="var(--font-sans), system-ui, sans-serif" font-size="13" font-weight="600" text-anchor="middle">
    <text x="75" y="155">Assume</text>
    <text x="200" y="155">Break down</text>
    <text x="325" y="155">Rebuild</text>
  </g>
</svg>
```

### 5.3 `comparison` — two sides
For contrast concepts (e.g. Fixed vs Growth Mindset).

```svg
<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" fill="none">
  <line x1="200" y1="40" x2="200" y2="260" stroke="currentColor" stroke-width="1.5" opacity="0.3" stroke-dasharray="6 6"/>
  <g stroke="var(--accent)" stroke-width="2.5">
    <rect x="40" y="70" width="120" height="160" rx="14"/>
    <rect x="240" y="70" width="120" height="160" rx="14"/>
  </g>
  <g fill="currentColor" font-family="var(--font-sans), system-ui, sans-serif" text-anchor="middle">
    <text x="100" y="105" font-size="15" font-weight="700">Fixed</text>
    <text x="300" y="105" font-size="15" font-weight="700">Growth</text>
    <g font-size="13" opacity="0.8">
      <text x="100" y="150">Avoids</text>
      <text x="100" y="172">challenge</text>
      <text x="300" y="150">Seeks</text>
      <text x="300" y="172">challenge</text>
    </g>
  </g>
</svg>
```

### 5.4 `matrix` — 2x2 quadrants
For two-axis concepts (e.g. Eisenhower Matrix). Keep axis labels inside the box
or they clip; place edge labels no further out than x≈350 and anchor them so
they stay within the viewBox.

```svg
<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" fill="none">
  <g stroke="currentColor" stroke-width="2" opacity="0.5">
    <line x1="200" y1="50" x2="200" y2="250"/>
    <line x1="70" y1="150" x2="350" y2="150"/>
  </g>
  <rect x="202" y="52" width="146" height="96" rx="8" fill="var(--accent)" opacity="0.12"/>
  <g fill="currentColor" font-family="var(--font-sans), system-ui, sans-serif" font-size="13" text-anchor="middle" opacity="0.85">
    <text x="135" y="105">Do now</text>
    <text x="275" y="105">Schedule</text>
    <text x="135" y="205">Delegate</text>
    <text x="275" y="205">Delete</text>
  </g>
  <g fill="currentColor" font-family="var(--font-sans), system-ui, sans-serif" font-size="13" font-weight="600" opacity="0.6">
    <text x="200" y="42" text-anchor="middle">Important</text>
    <text x="345" y="138" text-anchor="end">Urgent</text>
  </g>
</svg>
```

### 5.5 `scale` — spectrum / gradient of degree
For graduated concepts (e.g. Overton window).

```svg
<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" fill="none">
  <rect x="50" y="140" width="300" height="14" rx="7" stroke="currentColor" stroke-width="2" opacity="0.4"/>
  <rect x="170" y="137" width="90" height="20" rx="10" fill="var(--accent)" opacity="0.25" stroke="var(--accent)" stroke-width="2"/>
  <g fill="currentColor" font-family="var(--font-sans), system-ui, sans-serif" font-size="13" text-anchor="middle">
    <text x="60" y="185" opacity="0.7">Unthinkable</text>
    <text x="215" y="120" font-weight="700">Acceptable</text>
    <text x="340" y="185" opacity="0.7">Policy</text>
  </g>
</svg>
```

### 5.6 `pyramid` — hierarchy / layers
For stacked levels (e.g. Maslow). Keep the apex label short, it must fit the
narrow top.

```svg
<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" fill="none">
  <g stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round">
    <path d="M200 50 L255 130 L145 130 Z"/>
    <path d="M145 130 L275 130 L300 200 L120 200 Z"/>
    <path d="M120 200 L300 200 L325 270 L95 270 Z"/>
  </g>
  <g fill="currentColor" font-family="var(--font-sans), system-ui, sans-serif" font-size="13" font-weight="600" text-anchor="middle">
    <text x="200" y="108" font-size="10">Self-actual.</text>
    <text x="210" y="172" opacity="0.85">Esteem</text>
    <text x="210" y="242" opacity="0.7">Basic needs</text>
  </g>
</svg>
```

For numeric diagrams (bar comparisons, outlier plots, scatters), the same rules
apply: one accent series or point, neutral axes and gridlines in `currentColor`
at low opacity, numeric labels in `var(--font-mono)`.

---

## 6. The card visual (small square emblem)

The feed card always carries a small anchor, about 64 to 72 px square, sitting
top-right beside the headline. It is filled by a real licensed image when one
fits the fact (preferred), or by an emblem SVG when none does. This section
covers the emblem SVG; the image path is governed by `IMAGE_STANDARD.md`
(licensing, attribution, display).

A card emblem is **not a shrunk diagram**. At this size, fine labels and data
encoding are unreadable. It is a symbol, read in one glance.

- **viewBox `0 0 100 100`** (square), not the body's `0 0 400 300`. No width or
  height, transparent, `fill="none"` by default.
- **One idea, a few strokes.** Reduce the fact to a single mark: a pulse line, a
  spiral, an orbit, a seed, a wave. No more than a handful of paths.
- **No text labels.** If it needs words to read, it is the wrong mark.
- **Bolder strokes:** `stroke-width` 3 to 5; at 64 px a 2 px line vanishes.
- **Color:** the mark in `var(--accent)`, any secondary geometry in
  `currentColor` at low opacity. Same flat rules as the body (no gradients,
  shadows, filters).
- Round caps and joins, matching the Stage softness.

It should still read, and stay on-brand, as a tiny accent-colored glyph in the
corner of the card.

---

## 7. Embedding (context for Claude Code)

This is how the graphic resolves its colors; it is not an authoring rule.

- The SVG arrives as a raw string in the content field and is rendered inline
  by `SvgBlock.tsx`.
- **Security:** SVGs come from our own content pipeline, but sanitize before
  rendering (e.g. DOMPurify with an SVG profile) to strip `<script>` and the
  like. Mandatory if user-contributed content is ever allowed.
- **currentColor:** the render wrapper sets `color` to the app's neutral ink,
  so `currentColor` in the SVG resolves to the surrounding text color.
- **`--accent`:** the post container sets `--accent` to the active format
  color, so `var(--accent)` in the SVG resolves to that format's hex.
- The wrapper gives the SVG a max width (centered) and scales it with
  `width:100%; height:auto`. Never place a background behind it; the slab must
  show through.

---

## 8. Pre-save checklist

- [ ] `viewBox="0 0 400 300"`, no width/height
- [ ] Nothing exits the viewBox, especially edge labels
- [ ] Neutral elements use `currentColor`
- [ ] Exactly one accent element, using `var(--accent)`
- [ ] No background rectangle, `fill="none"` on root
- [ ] No shadows, filters, or gradients
- [ ] `stroke-linecap` / `linejoin` round, stroke-width 2 to 2.5
- [ ] Box corners `rx` 12 or more
- [ ] Labels short (1 to 2 words); `var(--font-sans)` for text, `var(--font-mono)` for numbers
- [ ] Renders without errors (valid syntax)

---

*One graphic, one set. Consistent Stage style, topic-specific meaning.*
