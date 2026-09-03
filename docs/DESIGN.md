# Plexive Design Identity: "Stage"

The visual identity of Plexive. Decided June 2026 after a three-way design
exploration (Folio / Console / Stage on branch `redesign/explore-3`); Stage
won and was consolidated across the entire app on
`redesign/consolidate-stage`. It builds on the neutral "Circuit" token palette
introduced earlier (tokens unchanged; the component vocabulary changed).

## The idea

Content floats in dark space. One post fills the stage; everything else is
quiet, detached chrome around it.

- **Frosted slabs, not bordered cards.** Surfaces are borderless translucent
  white fills (`rgb(255 255 255 / 0.04)`) with backdrop blur and large radii
  (`rounded-3xl`). Depth comes from blur and fill only — no borders, no
  drop-shadow stacks.
- **Detached pill chrome.** Persistent chrome never touches the screen edges:
  the feed tab strip is a floating frosted capsule, the bottom nav is a
  floating frosted pill dock inset 12px above the safe-area bottom, sheets
  float detached from every edge with rounded corners all around.
- **Springy, gesture-led motion.** Press feedback is a quick scale-down
  (`active:scale-95`, transition 150ms). Sheets spring in with a slight
  overshoot (`stage-sheet-in`). Loading states pulse as slabs
  (`stage-pulse`). All guarded for `prefers-reduced-motion`.
- **The dark neutral background is constant.** Every post in every category
  sits on the same near-black base with the dot-grid texture. Backgrounds
  never take on a post's color.
- **Accents are information, not decoration.** The per-format inks appear
  ONLY on small post-owned elements: the format marker dot above the slab,
  the teaser bullet markers, the active-tab dot in the capsule, and accent
  details inside post bodies (via `--accent`). Never as a slab fill, never
  as a background, never on persistent chrome. In mixed feeds (For You /
  Following) the accent switches hard with the settled card — nothing
  interpolates colors mid-swipe.
- **Glow only when functional.** Focus rings (lamp), achieved/active states.
  No ambient or decorative glow anywhere.
- **Reading comes first.** The serif (EB Garamond) is the voice of the
  content; the sans (Source Sans 3) is invisible chrome; Geist Mono carries
  numbers and metadata. Nothing competes with the post.

What this rules out: borders as decoration, edge-to-edge bars, colored
backgrounds, gradient fills, neon or ambient glow, anything that makes a
teaser or label look tappable when it is not.

## Tokens (single source of truth: `frontend/src/app/globals.css`)

The Circuit palette is unchanged by the Stage consolidation: near-black
surfaces (`surface-0..3`, `surface-overlay`; `surface-0` was rebased to the
slightly cool #0D0F17 on 2026-09-03), neutral gray edges
(`edge`, `edge-strong` — now used mainly for in-content hairlines like table
rows), neutral ink levels (`ink`, `ink-body`, `ink-dim`, `ink-muted`,
`ink-faint`), brand + semantic accents (`lamp` #7c6fff, `like` #ff3a5c,
`save` #f5c542, `good`, `bad`) and the seven `fmt-*` format inks (hexes
mirrored in `frontend/src/lib/formats.ts`). Inside post rendering the active
format ink is exposed as the CSS variable `--accent` (set once on the post
container); sections style with `text-(--accent)`, `bg-(--accent)/10` etc.
and never hardcode a color. Seed SVGs are re-paletted at render time in
`SvgBlock`; content JSON is never edited.

Stage layers its surfaces as translucent white fills on top of these tokens
instead of opaque surface steps:

| fill                      | use                                        |
|---------------------------|--------------------------------------------|
| `bg-white/[0.04]` + blur  | slabs (.card), inner blocks, loading slabs |
| `bg-white/[0.06]` + blur  | chrome pills (nav dock, capsule, inputs, icon circles) |
| `bg-white/[0.10]`–`[0.12]`| active fills (selected segment, send button, indicator pill) |

## Typography

| token        | font          | use                                   |
|--------------|---------------|---------------------------------------|
| `font-serif` | EB Garamond   | post titles, prose, quotes, headings  |
| `font-sans`  | Source Sans 3 | UI chrome, buttons, labels, chat      |
| `font-mono`  | Geist Mono    | numbers, metadata lines, Elo, stats   |

Long-form prose: 17px / 1.7 line-height, serif. UI text: 14–16px sans.
Card metadata: 11px mono, `ink-muted`, values joined with `·`.

## Motion

- `duration-150` state changes (hover, toggle, press scale)
- `duration-300` surface transitions (sheets, page slides)
- `stage-pulse` for loading slabs, `stage-sheet-in` for floating sheets
- easing: `ease-out` (sheets: a gentle overshoot cubic-bezier)
- `prefers-reduced-motion: reduce` disables nonessential animation

## Component vocabulary (utility classes in globals.css)

| class                       | role                                              |
|-----------------------------|---------------------------------------------------|
| `.card`                     | borderless frosted slab (white/4% + blur, 24px radius) |
| `.btn` + `.btn-primary`     | lamp-tinted pill (functional CTA accent)          |
| `.btn` + `.btn-ghost/quiet` | neutral frosted pills                             |
| `.btn` + `.btn-destructive` | bad-tinted pill                                   |
| `.btn-icon`                 | frosted circle, 44px tap target                   |
| `.field`                    | frosted fill input; single-line inputs add `rounded-full` |
| `.chip` + `.chip-on/off`    | frosted pill; active = neutral white/12% fill     |
| `.label-caps`               | uppercase section/meta label                      |
| `.prose-post`               | long-form reading voice                           |

Segmented controls (stats tabs, profile tabs, search scope) are frosted
capsules with a neutral filled active segment. Feed action rails are bare
glyphs with mono counts underneath — no containers. Charts use the Stage
chart theme in `stats/page.tsx` (frosted dark tooltip, `#8a8a8a` axes,
hairline grids, format-ink series colors).

Every screen must be expressible in tokens + vocabulary. If a screen needs a
new pattern, add it here and to globals.css first, then use it.
