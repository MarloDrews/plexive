# Roadmap and deferred decisions

What is decided but not yet built, so it is not forgotten. This is a memory aid,
not a spec. The specs live in the standards docs.

---

## Category glyph and eyebrow, from tags[0] (decided, in build)

**Decision.** Facts, concepts, questions, and academy show a small glyph at the
right end of the category line on the card and in the detail header, next to the
category label. Stories shows the same glyph as a fallback when no fitting licensed
image exists (when one does, stories carries the image instead, see
`LAYOUT_STANDARD.md`). Books and people show a cover or portrait, not a glyph. Both
the glyph and the category label come from the post's primary category, its first
tag (tags[0]), not from a separate field and not from the broad theme category.

**The taxonomy is the category vocabulary.** Rather than a separate curated field
list, the category is tags[0], a slug from the fixed 149-slug taxonomy in
`backend/seed.py`. Every slug has one compact glyph and one display name, so the
card's category identity (its eyebrow label and its glyph) is fully determined by
tags[0]. This reuses the tag taxonomy instead of maintaining a second list.

**How it resolves.**
1. The glyph set lives in `frontend/src/lib/glyphs.ts` (`FIELD_GLYPHS`, one compact
   SVG per slug, all 149 covered), read by tags[0].
2. The eyebrow label is the slug's display name (`Interest.name`, from seed.py's
   `slug_to_name`), read by tags[0].
3. Generators carry no per-post `card_visual` and no `feed_card.field`; both are
   retired, and the card resolves the glyph and label from tags[0] at render time.

**State.** The 149 glyphs are drawn (`glyphs.ts`). The renderer switch (glyph and
eyebrow from tags[0], `card_visual` out of the render path) is the current build
step. Leftover `feed_card.field` and `card_visual` in existing posts are ignored by
the new render path, so no data migration is required.

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
