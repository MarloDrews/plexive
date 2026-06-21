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
- **Card anchor:** books and people always put an image on the feed card (a
  hochkant book cover or a portrait beside the headline). Stories may put a real
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

1. **Card anchor** (feed card): books (a cover) and people (a portrait) always;
   stories when a fitting licensed image exists, else the field glyph. The
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
- Books and stories: concrete enough to carry real body images too, but their
  counts are settled in their own format passes, not assumed here.
- If no licensed image fits the subject, the post is all drawn visuals. That is
  a normal, good outcome, not a gap to fill with stock.
