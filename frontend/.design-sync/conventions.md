# Plexive — design system conventions

Plexive is a **dark-only** content app. Its visual language is "Stage": content
floats on a near-black surface; color appears only on accents (format inks,
brand lamp, action states). The serif (Newsreader) is the reading voice; the
sans (Source Sans 3) is invisible UI chrome.

## Setup — wrap designs on the dark Stage

Components are styled for a dark canvas (`--color-ink` text is near-white). On a
light background they vanish. Always:

- Set the page/container background to `var(--color-surface-0)` (#0a0a0a) and let
  text default to `var(--color-ink)`. The app sets this on `body` with
  `color-scheme: dark`.
- Load the bound `styles.css` — it `@import`s `_ds_bundle.css` (all tokens +
  component classes) and `fonts/fonts.css` (the three brand faces). Nothing is
  styled without it.
- The `*Section` components render one post-section each. They read an
  **`--accent`** CSS variable for their highlight color; a post container sets it
  to a format ink (e.g. `style={{ '--accent': '#6b9eff' }}` for Books). Set it on
  the wrapper or accents fall back to the brand lamp purple.

## Styling idiom — Tailwind v4 utilities over semantic tokens

There are no ad-hoc hex colors. Style with utilities generated from the design
tokens (all defined in `_ds_bundle.css`):

| Need | Utilities (real names) |
|---|---|
| Surfaces | `bg-surface-0` (page) `bg-surface-1` (cards) `bg-surface-2` (inputs) `bg-surface-3` (raised) |
| Text ink | `text-ink` `text-ink-body` `text-ink-dim` `text-ink-muted` `text-ink-faint` |
| Edges | `border-edge` (hairline) `border-edge-strong` |
| Format inks | `text-/bg-/border-fmt-{books,facts,people,concepts,questions,stories,academy,neutral}` |
| Brand + state | `text-lamp` (accent) `text-good` `text-bad` `text-like` `text-save` |
| Type | `font-serif` (Newsreader, prose) `font-sans` (Source Sans 3, UI) `font-mono` |
| Radii | `rounded-card` `rounded-field` (plus Tailwind `rounded-2xl/3xl/full` for chrome) |
| Accent (in posts) | `text-(--accent)` `bg-(--accent)/10` `border-(--accent)/40` |

Shared component classes (use verbatim, do not reinvent):

- `.card` — frosted slab (translucent white + blur), the panel surface.
- `.btn` + `.btn-primary` `.btn-ghost` `.btn-quiet` `.btn-destructive` `.btn-icon` — pill buttons.
- `.chip` + `.chip-on` `.chip-off` — toggle pills.
- `.field` — text inputs / textareas.
- `.label-caps` — the tiny uppercase wide-tracked micro-label.
- `.prose-post` — serif reading prose; the body voice of all long-form content.

## Where the truth lives

Read the bound `styles.css` and its imports (`_ds_bundle.css` for tokens and
component classes, `fonts/fonts.css` for the faces) before styling. Each
component's `<Name>.d.ts` is its prop contract and `<Name>.prompt.md` its usage
note. The `*Section` components are content renderers keyed to a post's section
content shape (see each `.d.ts`); compose them in a reading-width column on the
Stage.

## Idiomatic snippet

```tsx
// A Books post header on the Stage, accent set to the Books ink.
<div style={{ background: 'var(--color-surface-0)', '--accent': '#6b9eff', padding: 24 }}>
  <div className="max-w-[540px] mx-auto flex flex-col gap-4">
    <span className="label-caps">From the Book</span>
    <h1 className="font-serif text-3xl font-bold text-ink leading-tight">
      The Map Is Not the Territory
    </h1>
    <p className="prose-post">
      Every model we use is a compression - useful precisely because it leaves
      detail out.
    </p>
    <button className="btn btn-primary self-start">Read more</button>
  </div>
</div>
```
