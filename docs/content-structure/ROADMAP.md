# Roadmap and deferred decisions

What is decided but not yet built, so it is not forgotten. This is a memory aid,
not a spec. The specs live in the standards docs.

---

## Field glyph system (deferred, decided)

**Decision.** Facts, concepts, questions, and academy show a small glyph at the
right end of the field line on the card and in the detail header. Stories shows
the same glyph as a fallback when no fitting licensed image exists (when one does,
stories carries the image instead, see `LAYOUT_STANDARD.md`). The glyph belongs to
the **field** (the subject, e.g. Biology, Astronomy, True Crime), not to the
individual post, and not to the broad theme category. The glyph is the only drawn
mark on these typographic cards.

**Why a fixed field list.** A free-text field would mean an unbounded, ever-growing
set of glyphs and a glyph to draw for every new field, which forces per-post glyph
generation. The theme category (the ten taxonomy groups) is too coarse to be a
real anchor (Biology and Astronomy would share one mark). So the field becomes a
**fixed, curated list**, a few fields per theme category, each with one drawn
glyph. New fields are added deliberately, with a glyph, like the tag taxonomy.

**To build, in order.**
1. Define the fixed field list, derived from the ten theme categories (a handful
   of fields each). This is the first concrete step, before any drawing.
2. Draw one compact glyph per field (compact viewBox, one mark, accent color, per
   `SVG_STANDARD.md` section 6).
3. Decide where the field-to-glyph mapping lives (a lookup keyed by field, seeded
   like the taxonomy) and have the card and detail header read the glyph from it.
4. Constrain `feed_card.field` to the fixed list (validation), so a post cannot
   invent a field with no glyph.
5. Once the lookup exists, generators stop carrying a per-post `card_visual.svg`;
   the glyph is resolved from the field. Until then, an example carries one glyph
   inline so the layout can be seen.

**Interim state.** The Facts benchmark carries a single inline pulse glyph in
`card_visual.svg` to show the typographic card. This is scaffolding, replaced by
the lookup later.

---

## Other open work (already known)

- Build the remaining six formats the way Facts was built: skeleton, then a fully
  worked benchmark example, propagating every Facts-contract decision (typographic
  card, field glyph, graph fields, image roles, prose tells, font floor). Then the
  per-format bulk generation prompts.
- Quiz interaction: show one question at a time; answer, read the explanation,
  then advance (the next slides in); Elo at the end. Separate frontend run.
- Mobile app parity: the React Native app still uses the older card and header;
  bring it to the typographic card, field glyph, and redesigned detail header
  after the frontend look is settled.
- Read-only unused-field report for Facts, then prune docs and JSON to match.
- Key-figure person card text is too small (frontend CSS); enlarge and raise
  contrast.
- Per-format key section: each format designates the one section marked with the
  accent left-border (see `LAYOUT_STANDARD.md` section 7). Decide it in each
  format's own chat. Facts (the surprises section), Concepts (the how_to_apply
  section), Books (the heart section), and Academy (the key_findings section) are
  decided; facts and concepts are rendered in the web frontend, books is fixed in
  its skeleton and renders when the books pass reaches the frontend, and Academy is
  fixed in its skeleton as the accent-bordered KEY SECTION. The others: open.
- Latent-edge display: only a person edge can point at a post that does not exist
  yet, activating when that person's post is created. Non-person connections to a
  missing target are not stored at all. Anywhere edges surface, "Read next" now
  and the graph view later, a latent person edge whose target does not yet exist
  must be hidden or shown non-clickable, never a dead link. The stored person edge
  stays, and only its display is gated on the target existing.
- Cover-format detail header: the people portrait sits in the flat detail header
  (settled in the people pass). For books, the card and detail header carry a cover
  in two tiers, a real free cover with a verified rights record when one exists and
  otherwise a programmatically generated Stage cover, never copyrighted; the exact
  placement in the detail header is settled when the books render lands.
  LAYOUT_STANDARD section 1 and IMAGE_STANDARD sections 5 and 6 now carry this
  two-tier books model.
- Taxonomy (resolved): paleontology, botany, microbiology, and the optional
  `creativity` field have all been added; the taxonomy now holds 149 slugs in
  `backend/seed.py`, with no remaining flagged gaps.
- Skeleton spec pointers (post-slim): the header line in the people,
  questions, stories, and academy skeletons still sends the reader to
  DEEPSCROLL_CONTENT_STRUCTURE.md for the full per-format spec, but the slim moved
  that spec into the skeleton itself; the doc now holds only the schema, the
  shared shapes, and the rationale. Reword each pointer to the facts skeleton's
  form ("Schema and rationale: DEEPSCROLL_CONTENT_STRUCTURE.md") when that format
  gets its pass. The facts, concepts, and books skeletons are already correct.
- Detail-header dek: LAYOUT_STANDARD section 3 now carries an optional
  detail-header dek (added for concepts, which repeats the card dek because its
  body opens on a scene, not a definition). Still open: decide
  repeat-or-rely-on-opening for the other short-title formats (questions,
  academy, people, books) in each format's own pass, and reflect the choice in
  LAYOUT_STANDARD section 3.
