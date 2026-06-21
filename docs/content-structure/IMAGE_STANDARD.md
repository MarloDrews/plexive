# Image standard

Companion to `SVG_STANDARD.md`. That document governs visuals we draw; this one
governs visuals we source: photographs, artworks, archival images, and
portraits. It is cross-format (all seven) and applies to both the feed card
anchor and images inside a post. The app is dark only.

---

## 1. When an image rather than an SVG

- Data, structure, process, a comparison of quantities: draw it. See
  `SVG_STANDARD.md`.
- A real thing the reader benefits from seeing, an animal, an object, a place, a
  person, an archival scene: a sourced image.
- An image is never decoration. It must be about the subject at hand. A generic
  stock photo is worse than no image, and reads as filler. This mirrors A2 in
  `STYLE_GUIDE_LONGFORM.md`.

Think of the images in a good nonfiction book: they are specific, captioned, and
earn their place by showing something the text cannot.

---

## 2. Licensing (non-negotiable)

- Use only images you can verify are free to reuse: public domain, CC0, CC-BY,
  or CC-BY-SA. Never "all rights reserved," never an unclear or missing license,
  never an image whose terms you have not actually checked.
- Primary source: Wikimedia Commons. Other repositories are fine only if the
  license is stated plainly on the file's own page.
- Before using a file, verify three things on its page: the license; that the
  file genuinely exists at that URL; and that it truly depicts the stated subject.
  A mislabeled file is a factual error, not a stylistic one (A2).
- Never invent or guess an image URL. If no fitting, verifiable image exists, use
  none and let the drawn visuals carry the post. A missing image is fine; a
  fabricated or wrongly-licensed one is not.

---

## 3. Attribution (required with every image)

- Every image carries `image_attribution`. Format:
  `Creator, "Title", License (Source)`.
  Example: `Charles J. Sharp, "Gray Mouse Lemur 1", CC BY-SA 3.0 (Wikimedia Commons)`.
- Public-domain images still credit the creator and source where known; if the
  creator is unknown, state the collection and "public domain."
- CC-BY-SA carries a share-alike obligation. It is fine to display with credit;
  be aware of it if an image is ever altered.
- Attribution renders as a small, muted credit line beneath the image. It is not
  the caption.

---

## 4. Caption (optional, separate from the credit)

- `image_caption` is the line that tells the reader what they are looking at and
  why it is here, the way a figure caption works in a nonfiction book. One plain
  sentence. Its language follows `STYLE_GUIDE_LONGFORM.md` (no em-dashes, no AI
  tells). The credit in section 3 is a separate, smaller line.
- A portrait usually needs no caption; the person's name and role already label
  it. An illustrative photo usually benefits from one.

---

## 5. Display (context for Claude Code)

- Rounded corners to match Stage (`border-radius` 16 to 24). Full content width
  or modestly inset. Never distort the aspect ratio, and never upscale a small
  image past its native resolution; an obviously pixelated image is worse than
  none.
- Caption then credit sit below the image, small and muted, the credit smallest.
- **Card anchor:** books and people always put a cover-shaped image on the feed card beside the
  headline, never a field glyph. People uses a real portrait. Books uses a real
  cover only when a genuinely free one exists with a verified rights record, and
  otherwise a programmatically generated cover in the Stage system; a copyrighted
  cover is never used. Stories may put a real
  licensed image on the card when one fits the narrative, falling back to the
  field glyph when none does. The remaining typographic formats (facts, concepts,
  questions, academy) carry no card image; their card uses a small field glyph
  (see `SVG_STANDARD.md`), and any photos for them live in the post body.
- **Body image:** a rest between blocks of text and drawn graphics. It counts
  toward the post's visual-anchor budget and obeys the no-two-visuals-back-to-back
  rule in the skeleton's VISUAL PLAN.
- Dark-mode care: an image that is almost entirely pure white glares on the
  near-black slab. Prefer images with some tonal body, or let the container inset
  and round them so the slab still frames them.

---

## 6. The three image roles

1. **Card anchor** (feed card): people (a real portrait) always; books a cover
   always, real when a genuinely free one exists with a rights record and otherwise
   a programmatically generated Stage cover, never copyrighted; stories when a
   fitting licensed image exists, else the field glyph. The
   remaining typographic formats (facts, concepts, questions, academy) use a small
   field glyph, no card image (see `SVG_STANDARD.md` card rules).
2. **Illustrative image** (in a post body): a photo or artwork that shows the
   subject and gives the eye a rest. Optional, depends on a fitting licensed image
   existing.
3. **Portrait** (a key figure): the face of a named person, same licensing and
   attribution rules.

---

## 7. Pacing and per-format count

How many sourced images a post carries is decided per format, in each format's
own pass, by how image-bearing the subject is. It is not one number across the
app. A concrete, person- or place-centered subject earns more images; an
abstract one earns fewer or none. The counts below are the standing decisions so
far.

- Typographic formats (facts, concepts, questions, academy): one or two sourced
  images in a rich post, used as a rest, not a gallery, and often zero, since
  the subject is abstract and the drawn visuals carry the post. Portraits of key
  figures count toward that.
- People (a deliberate exception to the "one or two" above): besides the cover
  portrait, aim for two to three verified, freely licensed sourced body images,
  where the portrait-section image counts as one of them. Three is a ceiling for
  a rich biography, not a target to fill. The two is a target, not a hard floor:
  licensing in section 2 and the all-drawn fallback below outrank the count, so
  fewer is correct when no fitting freely licensed image exists, and you never
  add a stock or weakly sourced image to reach the number.
- Books: one or two sourced body images in a rich post, often zero. A book is
  carried by its ideas more than by a face or a place, so it sits near the
  typographic default rather than the People exception; the likeliest image is an
  author portrait, and any other (a place, an artifact, a documentary photo) earns
  its place only where an idea genuinely needs it. The cover is separate and does
  not count toward this body budget.
- Stories: concrete enough to carry real body images too, but its count is settled
  in its own format pass, not assumed here.
- If no licensed image fits the subject, the post is all drawn visuals. That is
  a normal, good outcome, not a gap to fill with stock.

---

## 8. Generated book cover: borrowing color and typeface

When a book has no free real cover (the normal case), Stage draws an original
cover from its title and author (the `GeneratedBookCover` component, deterministic
per book, a single flat SVG, no external request). The drawn pattern is always
original and is never traced from or modeled on any real cover.

Two things, and only two, may be borrowed from the book's real cover, because
neither is protected by copyright: a single background color and the title
typeface. The typeface is a font *similar to* the real lettering, never a
reproduction of a specific face. Nothing else is taken: not the artwork, not the
layout, not any graphic, illustration, or arrangement. This keeps the generated
cover legally clear while letting it evoke the book a reader may recognize.

This is the one place a card may be light rather than dark. The app is otherwise
dark only, but a cover stands in for a real, physical book, so a light cover
background is allowed; the title and author ink are derived from that background
so they always read.

When a `background` is borrowed, the generated cover switches to a text-only
layout that echoes how a real cover is set: the title centered in the upper third
(broken at commas, with connector words like "and" and "of" set smaller, the way
covers do) and the author centered below, in the borrowed typeface, with no
pattern and no rules. Books without a borrowed background keep the default dark
Stage cover with its abstract pattern.

Carry the hint per book in `feed_card.cover.generated_style` (tier-2 only; omit
it to keep the default dark Stage cover):

- `background`: the dominant background color sampled by hand from the real
  cover, as a hex value (for example `#fcfbf7` for Thinking, Fast and Slow).
  Sample it once and store it; nothing is fetched at runtime.
- `title_font`: a key naming a similar typeface the app loads, `cover-serif`
  (an inscriptional Roman-capital serif, Cinzel, that renders the title in
  capitals) or `stage-serif` (the default). Pick the one that resembles the real
  title. The exact face of many covers is a commercial font whose file cannot be
  bundled; borrow a similar open font, not the exact file.
- `ink` (optional): override the title color. By default it is derived from the
  background (dark on a light cover, light on a dark one), so it is rarely needed.

How to add one: open the real cover once, read off its dominant background color
and the broad style of its title type, set `background` to that hex, and set
`title_font` to whichever loaded font is closest. Add a new loaded font only when
no existing one is close enough, and keep it a general-purpose family, never a
font tied to a single cover.
