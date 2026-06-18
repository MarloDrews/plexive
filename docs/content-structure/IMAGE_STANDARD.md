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
  Example: `Charles J. Sharp, "Grey mouse lemur", CC BY-SA 4.0 (Wikimedia Commons)`.
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
- **Card anchor:** a roughly square crop, about 64 to 72 px, top-right of the
  feed card, beside the headline.
- **Body image:** a rest between blocks of text and drawn graphics. It counts
  toward the post's visual-anchor budget and obeys the no-two-visuals-back-to-back
  rule in the skeleton's VISUAL PLAN.
- Dark-mode care: an image that is almost entirely pure white glares on the
  near-black slab. Prefer images with some tonal body, or let the container inset
  and round them so the slab still frames them.

---

## 6. The three image roles

1. **Card anchor** (feed card): a small square image about the fact, or, when no
   licensed image fits, an emblem SVG instead (see `SVG_STANDARD.md` card rules).
   The card always carries one or the other.
2. **Illustrative image** (in a post body): a photo or artwork that shows the
   subject and gives the eye a rest. Optional, depends on a fitting licensed image
   existing.
3. **Portrait** (a key figure): the face of a named person, same licensing and
   attribution rules.

---

## 7. Pacing

- One or two sourced images in a rich post, used as a rest, not a gallery.
  Portraits of key figures count toward that.
- If no licensed image fits the subject, the post is all drawn visuals. That is a
  normal, good outcome, not a gap to fill with stock.
