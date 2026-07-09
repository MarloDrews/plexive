# Batch 10 (Accessibility), Implementation Notes and Residuals
Date: 2026-07-09 | Branch: a11y/pre-launch

This batch implemented M154 through M164 plus decisions 12 (person-portrait alt
text) and 13 (hidden scrollbars). What follows is the record of what was left
open on purpose, where the implementation departed from the approved plan, and
what the owner should know before deploying.

## Decisions applied

- **Decision 12, portraits and captioned figures.** An image whose describing
  text already renders next to it takes an empty `alt`, so a screen reader never
  reads the same words twice. Applied uniformly: `StorySection`'s key-figure
  portrait lost its `alt={fig.name}`, and all three book-cover paths
  (`BookCover` real cover, its baked cover, `GeneratedBookCover`) are
  `aria-hidden` because every call site renders the title, and usually the
  author, as text beside the cover.
- **Decision 13, scrollbars.** They stay hidden. The rule in `globals.css`
  carries a comment recording that this is a product choice and that a
  user-facing setting to restore visible scrollbars is planned. No toggle was
  built.

## Departures from the approved plan (owner reviewed and kept)

The plan called for a `label` prop on `SvgBlock`, an `alt` prop on
`ContentImage`, and a `role="img"` name of "Title by Author" on the book covers.
All three were dropped, because decision 12 makes them unreachable:

- Every `SvgBlock` visual is either captioned by its section (the caption renders
  as visible text below it) or is a field glyph with no text of its own, and the
  content schema has no alt field. No caller could ever supply a label, so the
  prop would have been dead code. Both the seed and user-content paths are hidden
  from assistive tech instead.
- `ContentImage` already renders `figure`/`figcaption` with `alt=""`, which is
  the correct treatment for a captioned figure.
- Naming a book cover would read the title twice. The covers are hidden.

## Accepted residuals (documented, not fixed)

- **Explanatory diagrams have no alt text and cannot get one here.** A named
  diagram needs a new field in the post content schema, and post JSON and schema
  were out of bounds for this batch. Until that field exists, `SvgBlock` hides
  its visual rather than announcing an unlabelled graphic; silence beats invented
  alt text. This is the one finding (A11Y-005) that is mitigated rather than
  fully resolved.
- **`useReducedMotion` is still duplicated** in `Marathon.tsx` and `Battle.tsx`.
  The new `lib/motion.ts` (`prefersReducedMotion`, `scrollBehavior`) is written
  so both can adopt it. Consolidating them is M017, Batch 6 leftovers.
- **Two programmatic smooth scrolls remain ungated**: the scroll-to-first-error
  in `create/page.tsx` (two call sites) and the read-aloud follow scroll in
  `lib/readAloud/useReadAloud.ts`. A11Y-025 named only three sites, all of which
  are fixed; these were noticed while doing it and left inside the batch
  boundary. They are a one-line change each using `scrollBehavior()`.
- **`--color-ink-faint` now has no consumer.** All 57 `text-ink-faint` sites moved
  up to `text-ink-muted` in the M158 rebase. The token stays defined as a
  non-text hairline-graphics color, per the finding; retiring it belongs to M097.
- **A visible-scrollbar accessibility setting is planned, not built** (decision
  13). Recorded here and in a comment above the rule in `globals.css`.

## Found while verifying, fixed inside this batch

- **The post page's heading outline was inverted.** Promoting the post title to
  `h1` (M161) exposed it: section labels were `h3` while the item titles inside
  those sections were `h2`, so the page skipped from `h1` straight to `h3`.
  `SectionLabel` is now an `h2` and the item titles inside a section are `h3`
  (`CoreIdeasSection`, `GreatestWorkSection`, `DefiningMomentsSection`). Styling
  rides on classes, so nothing moved.
- **`AtAGlanceSection` carries its own copy of `DotScale`** whose `aria-label`
  sat on a roleless `span`, where the name is dropped. It failed at the base
  commit too, so it was pre-existing rather than a regression. It now matches the
  shared component: dots hidden, reading in an `sr-only` span.
- **`link-in-text-block` on `/login` and `/register`.** The auth links were
  marked as links by their lamp color alone. Both are underlined now, matching
  the sign-in link the comments sheet already rendered that way. Not one of
  M154 to M164; fixed on the owner's instruction because the batch was open.
- **`Dialog` wrote refs during render**, which `react-hooks/refs` rejects. The
  invoker is now captured in the mount effect, which runs on the first commit
  while the portal has not yet rendered, so the focused element there is still
  the invoker.

## Measurement notes (so the numbers are not misread)

- The first `/post` baseline was invalid: the page never rendered its content
  (`heading-order` came back `notApplicable`, meaning no headings existed), so it
  scored an optimistic 95. Baselines for the backend-dependent screens were
  re-captured against a real build of the base commit. Honest before/after,
  Lighthouse accessibility category: post 92 to 100, search 93 to 100, stats 94
  to 100, login 91 to 100, register 91 to 100, onboarding 95 to 100 (and 93 to
  100 when reached through a `/` request, which redirects there). `color-contrast`
  failed on every screen at base and passes everywhere now.
- **Lighthouse never measures the feed.** Requesting `/` as a guest redirects to
  `/onboarding` (the gate is a `deepscroll_interests` array in localStorage, not
  auth), so the row labelled "home" is the onboarding page. The real feed was
  checked separately by running axe-core against it over CDP with that key
  seeded: zero violations.
- **The search follow button was not exercised live.** It only renders for a
  logged-in user. Its structure was verified statically and the page was checked
  for the anchor-inside-button nesting the finding described (zero on the page).

## Contrast rebase, for the record (M158)

Ratios are WCAG 2.x against the real composited surfaces: base `#0a0a0a`, the
`.card` slab (white 4% over base), the `.field` fill (white 6% over the slab).

| token | old | new | base / slab / field (new) |
|---|---|---|---|
| `--color-ink-dim` | `#8a8a8a` | `#a3a3a3` | 7.85 / 7.30 / 6.31 |
| `--color-ink-muted` | `#606060` | `#8a8a8a` | 5.73 / 5.34 / 4.61 |
| `--color-bad` | `#c05870` | `#c96a80` | 5.52 / 5.14 / 4.44 |
| `--color-ink-faint` | `#3a3a3a` | unchanged | non-text token, 1.74 on base |

`bad` measures 4.44 on a field fill, below AA, but it is never text there: error
paragraphs are siblings of the field and render on the slab at 5.14. The
destructive button reads 4.91 on its own tint. `.btn-destructive` and the Battle
and Marathon option styles held copies of the old hex and would not have received
the rebase; they now point at `var(--color-bad)` through `color-mix`, which Chrome
resolves to exactly `rgb(201 106 128 / 0.12)`.

## Deploy

Frontend redeploy only. The rebase changes the built CSS; no backend change, no
migration, no environment variable.
