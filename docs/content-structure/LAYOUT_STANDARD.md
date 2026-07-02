# Layout standard

Cross-format. How a post is composed on the feed card and at the top of the
detail page. This owns *composition and order of the chrome around the content*.
Its siblings: the skeletons and `SKELETON_COMMENT_STANDARD.md` own the sections
inside a post; `SVG_STANDARD.md` owns how a drawn visual looks; `IMAGE_STANDARD.md`
owns how a sourced image is licensed and shown; `STYLE_GUIDE_LONGFORM.md` owns
language. The app is dark only.

This is a frontend contract. Generators do not control layout; they fill the
fields, and the frontend composes them as described here. When a new format is
built, its card and detail page follow this document.

---

## 1. Three card looks, chosen by the format

Which look a format uses is fixed, not per post.

- **Cover formats** (books, people): the card shows a cover-shaped image beside the
  headline, never a field glyph. People always shows a real portrait, since portraits
  of notable people are reliably free to license. Books shows a cover in two tiers: a
  real cover when a genuinely free one exists (public domain, CC0, CC-BY, CC-BY-SA)
  carried with a verified rights record, and otherwise a programmatically generated
  cover in the Stage design system. A copyrighted cover is never used. The people layout is
  unchanged; the books card moves from an assumed real cover to this two-tier model.
- **Story format** (stories): a story is a concrete real-world narrative, so it
  often has a genuine, evocative licensed image (an archival photo, the place, the
  object, a person involved). When one fits, the card carries it; this is real,
  on-subject pull, not decoration. When none fits, the card falls back to the
  typographic look with the field glyph. The exact placement is settled when the
  stories format is built; the likely choice is a full-width image at the top
  rather than a side cover, because story headlines are long and a real photo
  fills a top band well (a thin glyph would not, which is why the typographic
  formats below carry no top band).
- **Typographic formats** (facts, concepts, questions, academy): the subject is
  abstract, so a card photo would be decoration. The card is clean and
  typographic: an accent bar down the left, a field line (label plus a small
  glyph), the large serif headline, teasers, footer. The glyph is the only drawn
  mark; any data graphic for these lives in the post body.

Photos always earn their place inside the post body (see `IMAGE_STANDARD.md`)
regardless of the card look. The cards stay a coherent Plexive face; the body is
where real images give the eye a rest.

---

## 2. Feed card, top to bottom (typographic formats)

1. **Field line**: the field label small in the accent color ("BIOLOGY") at the
   left, and a **small glyph at the right end** of the same line. If the field is
   long it wraps to two lines and the glyph stays at the right. Accent bar runs
   down the left edge of the card.
2. **Headline**, full width, large serif, the key number emphasized. The star.
3. **Context line** (format-dependent), small and muted, directly under the
   headline: the author (books), the lifespan (people), the source citation
   (academy), a year or era (stories). Facts uses none. A format that has nothing
   to put here omits the line.
4. **Dek** (optional), a one-line italic gloss of what the post is about. It is
   present when the headline is a short title that needs a plain-language line to
   land (concepts, questions, academy, people, books), and absent when the
   headline is already a full statement (facts) or a narrative opening (stories).
5. **Teasers**, exactly three.
6. **Footer**: creator (round avatar + name), reading time, difficulty (the
   three-dot scale).

The footer carries only creator, reading time, and difficulty. Other per-format
metadata is deliberately not shown on the card; it varies between formats and
looks inconsistent across the feed.

The dek and the context line are the controlled places where formats differ. The
rule is the same across the feed: a short-title headline earns a dek; a
full-statement headline stands alone. Keeping that consistent is what makes the
feed read as one product rather than seven.

The category label and the glyph both come from the post's first tag, tags[0], its
primary category: the label is that slug's display name, the glyph is that slug's
mark from `frontend/src/lib/glyphs.ts`. There is no per-post `card_visual` and no
separate field. Cover formats use the same parts with the cover or portrait beside
the headline instead of a glyph.

---

## 3. Detail page header, top to bottom

The detail header opens straight into the post; the headline appears exactly once.
Continuity from the tapped card comes from the shared field line, glyph, and accent
bar.

1. **App top bar**: back, the format label with its accent dot, audio. (App frame.)
2. **Field line**: field label (accent) with the small glyph at its right end,
   same as the card.
3. **Headline**, once, large serif, accent number. The first impression; it owns
   the top of the page.
4. **Dek** (optional), the one-line italic gloss from the feed card, directly
   under the headline in the same treatment. Present for the short-title formats
   whose card carries a dek, so the plain-language gloss persists onto the detail
   page. Concepts repeats the card dek here (its body opens on a scene, not a
   definition, so the definition would otherwise not persist); books likewise
   repeats its `one_line` dek, because its body opens on the case for reading
   (`why_read_it`), not a one-line identification of what the book is, so the plain
   gloss would otherwise not persist. The other short-title formats decide
   repeat-or-rely-on-opening in their own pass (see `ROADMAP.md`). Absent when the
   headline is a full statement (facts) or a narrative opening (stories).
5. **Meta row**: round avatar + creator name, then reading time, then difficulty.
   The creator here and on the card come from one source and always match.
6. **Quiz badge**.
7. **Sections**, in their defined order.
8. **Tags**, at the end, as small chips near the sources. Not in the header: the
   field label already orients the reader, and tags are the network and filter
   system, which belongs at the foot of the post.

Cover formats (books, people) place their cover or portrait into this same flat
header. The header still opens flat for them: the headline appears exactly once,
and the whole feed card is never reproduced as a bordered slab at the top of the
detail page. The two cover formats place their image differently on purpose,
because the artifacts differ: **people** sets the round portrait to the left of
the name, read as one biography-intro unit; **books** centers the two-tier cover
above the title and presents it face-on (the book as an object). This is a
deliberate per-format choice, not an inconsistency to reconcile. For books the
order is: the centered cover at readable size, then the genre as the accent
kicker, the title as the single headline, the author as the context line, and the
`one_line` dek repeated under the title. A real book cover carries the required
rights-record credit as a small muted line directly beneath the cover (a
generated cover shows none); people portraits are reliably free and carry no
prominent header credit. Books has no in-body cover section, so the header is the
only place a book cover's credit can live.

---

## 4. Creator identity

The creator shown on the feed card and on the detail page resolve from the same
source and always match. Never a hardcoded fallback such as the app name.

---

## 5. Scrolling

Hide scrollbars, vertical and any horizontal, for a clean surface. A horizontal
scrollbar almost always means real overflow, usually an element wider than its
container (an over-wide element such as a body SVG). Fix the overflow at its
source; do
not only mask the bar.

---

## 6. Headline treatment

**Alignment.** Left-aligned, on both the card and the detail header. It keeps the
card and the detail page on one axis, sits on the same left edge as the field
line, meta row, and body, and stays readable for the long multi-line headlines
that facts and stories carry (the eye finds every line at the same starting edge).
Centered can read like a title page for a short headline, but the mixed long and
short headlines across formats make left the consistent choice.

**Voice.** Serif (the same family as the card headline), medium weight, with a
snug rather than tight line-height so a multi-line headline breathes. The card and
the detail headline share this one type system; they differ only in size, the
detail one step larger.

**Measure.** A comfortable measure cap (around 24ch, tuned at the rendered look)
keeps a long headline from running fully edge-to-edge. It still wraps and still
starts every line at the same left edge; the cap only stops the line from growing
uncomfortably wide.

**The accent number stays whole.** The emphasized key number or phrase (the accent
unit) never breaks across a line wrap. "1 billion" moves to the next line together
rather than splitting "1" from "billion". This is set once in the shared accent
helper, so it holds for every format and every accent number.

---

## 7. Detail page visual system (cross-format)

The body of a post should read as one system, not a stack of differently styled
blocks. The cohesion comes from a small shared kit and one through-line, the
format accent color. Everything below is identical across all seven formats; only
the accent color changes per format. This keeps the text the star while lifting
the page above a plain wall.

- **Section labels** carry the emphasis, not size. Each section opens with a small
  caps label in the accent color. The repeated accent caps label, identical on every
  section, is the through-line that makes the page read as one system. Labels are not
  enlarged; the accent does the work, with no extra ornament before the text.
- **Vertical rhythm** is uniform: one consistent spacing unit between sections. A
  visual sits tight to the text it belongs to, with no large gap opening between a
  graphic and its section. White space is the divider; avoid mixing rules, boxes,
  and spacing as three competing divider systems.
- **Per section-type affordance, from a shared kit** (so each section is
  recognizable without being bespoke): simple lists use accent dots; misconceptions
  use the struck-through myth plus an accent check on the reality; key figures use
  person cards; open questions use a "?" marker and are phrased as real questions
  ending in a question mark; an in_practice line inside a core idea is set off as a
  small labeled block, an accent caps label ("In practice") above the sentence with
  light separation, never the reserved key-section left-border. The section type
  chooses from the kit; sections do not invent their own ornament.
- **The key section.** Exactly one section per format is marked with an accent
  left-border (a light emphasis: a `border-l-2` accent rule plus an optional faint
  accent wash, never a full filled block), marking the post's turning point or
  payoff. It is the one deliberate exception to the otherwise unmarked rhythm, so it
  must stay rare: one section, one format. Every other section carries no border.
  Which section is the key section is fixed per format (see `ROADMAP.md`); for facts
  it is the surprises section (the reframe), and for concepts it is the
  `how_to_apply` section.
