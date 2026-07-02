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
  headline, never a category glyph. People uses a real portrait. Books uses a real
  cover only when a genuinely free one exists with a verified rights record, and
  otherwise a programmatically generated cover in the Stage system; a copyrighted
  cover is never used. Stories may put a real
  licensed image on the card when one fits the narrative, falling back to the
  category glyph when none does. The remaining typographic formats (facts, concepts,
  questions, academy) carry no card image; their card uses a small category glyph
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
   fitting licensed image exists, else the category glyph. The
   remaining typographic formats (facts, concepts, questions, academy) use a small
   category glyph, no card image (see `SVG_STANDARD.md` card rules).
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

- Typographic formats (facts, concepts, academy): one or two sourced
  images in a rich post, used as a rest, not a gallery, and often zero, since
  the subject is abstract and the drawn visuals carry the post. Portraits of key
  figures count toward that.
- Questions (looser than the other typographic formats by design): there is no
  cap and no "often zero" default. Use a sourced image wherever one genuinely fits
  and shows something the text cannot (a place, an object, an archival scene, a
  thinker's portrait), and never skip a fitting image to stay under a count. The
  limit is the two guards in the Questions skeleton's VISUAL PLAN, not a number:
  every image must say something (no filler, the A2 rule), and images must stay
  balanced across the positions, so no single perspective carries a portrait the
  others lack. Drawn diagrams are governed by that VISUAL PLAN and are not counted
  here. Licensing in section 2 still binds, and a missing image is fine when none
  fits; only filler and asymmetry are wrong.
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

## 8. Generated book cover: a baked SVG that evokes the real cover

When a book has no free real cover (the normal case), it ships on a generated
cover: a complete, bespoke SVG, written once per book and stored on
`feed_card.cover.svg`, that the app renders as-is. Each book's cover is its own
SVG, because each real cover is set differently; a single shared layout would make
every book look identically arranged, which is wrong.

What the generated cover takes from the real cover, and nothing else:

- the dominant **background color** (sampled as a hex);
- a **typeface** similar to the real title's, from the loaded cover fonts (the
  exact face is often a commercial font whose file cannot be bundled, so use a
  close open font, never the exact file);
- the **typographic arrangement of the title text**: its line breaks, the relative
  sizes within it (for example a small "and" between larger words), and where the
  title and author sit on the cover.

Never take any pictorial element: no illustration, photograph, graphic, ornament,
or logo from the real cover, and never trace or embed any image from it. Color,
typeface, and the typographic arrangement of the title are the whole of what is
borrowed.

This is the one place a card may be light rather than dark. The app is otherwise
dark only, but a cover stands in for a real, physical book, so a light cover
background is correct; pick the ink so the title and author always read on it.

The SVG is flat (no gradients, shadows, or filters), uses a 2:3 portrait viewBox,
fills its box (`preserveAspectRatio` slice), and sets the title font through
`style="font-family: var(--font-cover-...)"` (a CSS var resolves there; an SVG
`font-family` attribute does not). The loaded cover fonts, each a free family
exposed as a CSS var in `frontend/src/app/layout.tsx`, currently include:

- `--font-cover-serif` (Cinzel, inscriptional Roman capitals)
- `--font-cover-didone` (Playfair Display, high-contrast modern serif)
- `--font-cover-garamond` (EB Garamond, classical old-style serif)
- `--font-cover-slab` (Zilla Slab)
- `--font-cover-sans` (Inter, neo-grotesque sans)
- `--font-cover-geometric` (Poppins, geometric sans)

This is an extensible set: when no loaded font is close enough to a real cover,
add the nearest free Google font as a new `--font-cover-*` var and use it. A book
whose `feed_card.cover.svg` is absent falls back to a generic generated cover the
frontend draws live; a baked SVG is the intended result.
