# Deepscroll Design Identity: "Lamplight"

The visual identity of Deepscroll. Decided June 2026 during the full redesign,
synthesized from the ui-ux-pro-max design-system generator (strongest matches:
E-Ink/Paper reading style, OLED dark mode, Editorial Grid typography) and
adapted to Deepscroll's purpose.

## The idea

Deepscroll replaces doomscrolling with substance. People open it where they
used to doomscroll: in the evening, on the couch, in bed. The design is a
**quiet library at night** — warm dark paper lit by a reading lamp.

- **Warm dark, not cold dark.** Surfaces are near-black with a warm paper
  cast, never blue-gray zinc. Text is warm off-white ink, never pure white.
- **Matte, not glossy.** No glows, no gradients-as-decoration, no glass
  blur. Surfaces separate by hairline edges and tone, like sheets of paper.
  A barely visible paper-grain texture sits on the page base.
- **The serif is the voice.** Post titles and long-form prose are set in
  Newsreader, a serif designed for on-screen reading. UI chrome (buttons,
  tabs, labels) is set in Source Sans 3 so it disappears behind the content.
  Numbers and data are Geist Mono.
- **Color belongs to knowledge, not to chrome.** The UI itself is almost
  monochrome. The only colors on screen are the format inks (below) and the
  lamp-gold brand accent — used sparingly for links, focus and active states.
- **Calm motion.** 150 ms for state changes, 300 ms for surfaces. Nothing
  pulses, bounces or autoplays. `prefers-reduced-motion` is respected.

What this rules out: neon accents, glow effects, attention-grabbing badges,
pure black/white contrast, decorative animation, anything that competes with
reading.

## Tokens (single source of truth: `frontend/src/app/globals.css`)

### Surfaces

| token             | value                  | use                          |
|-------------------|------------------------|------------------------------|
| `surface-0`       | `#121110`              | page base                    |
| `surface-1`       | `#1B1815`              | cards, panels                |
| `surface-2`       | `#23201B`              | inputs, inner blocks         |
| `surface-3`       | `#2B2721`              | raised elements, hover fills |
| `surface-overlay` | `rgb(18 17 16 / 0.95)` | bars, sheets, modals         |

### Edges

| token         | value                     | use                       |
|---------------|---------------------------|---------------------------|
| `edge`        | `rgb(168 158 142 / 0.14)` | hairline dividers         |
| `edge-strong` | `rgb(168 158 142 / 0.30)` | inputs, outlined buttons  |

### Ink (text)

| token       | value     | use                  |
|-------------|-----------|----------------------|
| `ink`       | `#EFE9DE` | headings, primary    |
| `ink-body`  | `#CFC7B8` | body prose           |
| `ink-dim`   | `#A39B8B` | secondary            |
| `ink-muted` | `#7D7567` | labels, meta         |
| `ink-faint` | `#5B5448` | fine print           |

### Brand + semantic

| token  | value     | use                                        |
|--------|-----------|--------------------------------------------|
| `lamp` | `#D2A45A` | brand accent: links, focus, active states  |
| `good` | `#7DA869` | success, correct quiz answers              |
| `bad`  | `#C0604E` | errors, wrong quiz answers, destructive    |

### Format inks (in `frontend/src/lib/formats.ts` + `@theme` as `fmt-*`)

Muted book-spine colors at matched lightness so the feed reads as one shelf.

| format    | name       | value     |
|-----------|------------|-----------|
| books     | gold leaf  | `#D2A45A` (same as `lamp` — the founding format carries the brand accent) |
| facts     | verdigris  | `#76ADA0` |
| people    | dusty rose | `#C5848F` |
| concepts  | heliotrope | `#A08FC9` |
| questions | moss       | `#93AF7C` |
| stories   | terracotta | `#C98A62` |
| academy   | slate ink  | `#8398C9` |
| fallback  | warm gray  | `#A59C8D` |

Inside post rendering the active format ink is exposed as the CSS variable
`--accent` (set once on the post container); sections style with
`text-(--accent)`, `bg-(--accent)/10` etc. and never hardcode a color.
Seed SVGs are re-paletted at render time in `SvgBlock` (old accent hex →
format ink); content JSON is never edited.

### Typography

| token        | font          | use                                   |
|--------------|---------------|---------------------------------------|
| `font-serif` | Newsreader    | post titles, prose, quotes, headings  |
| `font-sans`  | Source Sans 3 | UI chrome, buttons, labels, chat      |
| `font-mono`  | Geist Mono    | numbers, Elo, stats, formulas         |

Long-form prose: 17px / 1.7 line-height, serif. UI text: 14–16px sans.
Section labels: 11px uppercase, 0.18em tracking, `ink-muted`.

### Radii

| token          | value | use                         |
|----------------|-------|-----------------------------|
| `radius-card`  | 14px  | cards, panels               |
| `radius-field` | 10px  | inputs, buttons             |
| `radius-sheet` | 20px  | bottom sheets (top corners) |

Chips, badges and avatars are full pills/circles.

### Motion

- `duration-150` state changes (hover, toggle, focus)
- `duration-300` surface transitions (sheets, page slides)
- easing: `ease-out`; `prefers-reduced-motion: reduce` disables nonessential animation

## Component vocabulary (utility classes in globals.css)

| class                       | role                                        |
|-----------------------------|---------------------------------------------|
| `.card`                     | surface-1 panel with edge hairline          |
| `.btn` + `.btn-primary`     | paper button: ink fill, dark text           |
| `.btn` + `.btn-ghost`       | outlined quiet button                       |
| `.btn` + `.btn-quiet`       | text-only button                            |
| `.field`                    | input/textarea/select                       |
| `.chip` + `.chip-on/off`    | selectable pill (filters, interests, tabs)  |
| `.label-caps`               | uppercase section/meta label                |

Every screen must be expressible in tokens + vocabulary. If a screen needs a
new pattern, add it here and to globals.css first, then use it.
