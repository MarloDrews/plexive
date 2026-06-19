# Deepscroll — Skeleton Comment Standard

How to write the `//` comments inside every `*_skeleton.jsonc` file so that a generation model can fill the skeleton correctly from the comments alone.

This document governs the **comments**. It does not govern prose (that is `STYLE_GUIDE_LONGFORM.md`) and it does not govern the schema or its rationale (that is `DEEPSCROLL_CONTENT_STRUCTURE.md`). When all three are in sync, a model handed only the `.jsonc` should be able to produce a correct, on-brand post without reading the other two.

---

## 1. Who reads these comments

The reader is a **generation model filling the skeleton**, not a developer maintaining it. Every comment is therefore an **instruction**, written in the imperative, telling the model what to produce. It is never documentation of design history, never a note to a future maintainer, never a justification of why the section exists. Those belong in `DEEPSCROLL_CONTENT_STRUCTURE.md`.

Test for any comment: *would this change what the model writes in the field?* If no, cut it.

---

## 2. Separation of concerns

Three documents, three jobs. A comment must stay in its lane.

| Concern | Lives in | Comment may reference it, never restate it |
|---|---|---|
| Prose quality (vocabulary, rhythm, voice, punctuation, quiz style) | `STYLE_GUIDE_LONGFORM.md` | yes |
| Schema, field types, design rationale, energy-curve reasoning | `DEEPSCROLL_CONTENT_STRUCTURE.md` | yes |
| Per-section structural contract: job, include/skip, boundaries, counts | the `.jsonc` comments (this standard) | this is the source |

**Do not duplicate the prose blacklists in section comments.** The vocabulary blacklist, the contrast-frame ban, the hedging ban: these are universal and live in one place. Restating them per field bloats the skeleton and guarantees drift the day the blacklist changes. The only prose rule inlined anywhere is the em-dash ban, stated once in the file header (see Section 6), because the model mirrors comment punctuation into its output.

When a section has a prose requirement that is **specific to it** and not in the style guide (for example "open on a concrete scene, not a date"), that belongs in the comment. General prose quality does not.

---

## 3. Controlled vocabulary

Comments use a fixed set of keywords so they are scannable and so the model parses intent the same way every time. Use these exact words.

| Keyword | Meaning | Where |
|---|---|---|
| `REQUIRED` / `OPTIONAL` | Section presence. Every section header carries one. | section header line |
| `HARD:` | Non-negotiable constraint fixed by the UI or scoring system. Breaking it breaks the product (e.g. exactly 4 options, array length exactly 3, quiz 5-10). | field or section |
| `Guideline:` | A soft target. Content quality overrides it. **Never a cap.** Always carries the word "guideline". | field or section |
| `Include when` / `Skip when` | The mechanical decision test for an OPTIONAL section. Both required on every OPTIONAL section. | section header block |
| `Owns` / `Not here (belongs to <section>)` | Boundary against an overlapping section. | section header block |
| `Avoid:` | A named anti-pattern for this field. | field |
| `omit` | Optional field: drop the key entirely when unused. | field type annotation |
| `null` | Reserved for fixed feed-card slots the card layout always reserves. | feed-card fields only |

If a number appears without `HARD:` or `Guideline:` in front of it, the comment is wrong. Every number is one or the other.

---

## 4. Anatomy of a section comment

Every section comment has the same parts in the same order. The model learns the shape once and applies it everywhere.

```jsonc
{
  "type": "surprises",   // Why It Surprises Us (REQUIRED)
  "order": 3,
  // JOB: name the single intuition the post breaks. This is the post's
  //      turning point; a reader who stops here should leave with the
  //      reframe, not just the number.
  // (OPTIONAL sections add here:)
  //   Include when: <concrete, testable condition>.
  //   Skip when:    <concrete, testable condition>.
  // (only if overlap risk:)
  //   Owns: the reframe. Not here: discovery history (belongs to story).
  "content": ""  // string. Guideline: 3-5 sentences. State what we expected,
                 // what is true, and why the gap. Avoid: "this is surprising
                 // because" openings; show the breakage instead.
}
```

The mandatory elements:

1. **Header line**, on the `type` line: `// <Human Section Title> (REQUIRED|OPTIONAL)`. The title is the on-page heading intent, not the type string.
2. **JOB line**, one sentence: which reader question this section answers, plus what the reader walks away with if they stop here (the drop-off note). This is mandatory for **every** section, required or optional. It is the line that was missing when the Facts aha ended up buried: nothing told the model the section was the payoff.
3. **Include / Skip**, OPTIONAL sections only: two concrete tests. "Include only if it adds value" is banned, it is what produced bloat. The test must be mechanical enough that two different models decide the same way.
4. **Boundary**, only when another section can cover the same ground: `Owns: X. Not here: Y (belongs to <section>).` Stated on **both** sides of the overlap.
5. **Field instructions**, inline per field: presence (`omit`/`null`), what to write, every count tagged `HARD:` or `Guideline:`, and the one highest-risk `Avoid:` if the field has a known failure mode.

Keep the JOB and Include/Skip as line comments above the object. Keep field instructions inline after each field. Do not scatter the contract across both places.

---

## 5. Field-comment conventions

**Presence semantics.** Optional content fields are **omitted entirely** when unused. The template shows `""` as a placeholder only; the instruction `| omit` tells the model the empty string is not a valid output. Whole unused OPTIONAL section objects are dropped from the array, not left in with empty fields. `null` appears only where a format's skeleton explicitly marks a slot as always present but possibly empty for the renderer; absent that explicit note, an unused optional field is omitted.

**Counts.** Every count is tagged. `HARD:` for anything the UI or scoring depends on (exact option counts, exact array lengths, quiz range). `Guideline:` for everything else, and the comment makes clear the model overshoots or undershoots the guideline when the content earns it. A guideline range is never treated as a cap: "Guideline: 3-5 sentences" means write what the point needs, near that band.

**Anti-patterns.** One `Avoid:` per field at most, and only for the single failure mode most likely to occur. A field stuffed with five "avoid" clauses is noise; the model stops reading. Pick the one that actually goes wrong.

**Voice.** Imperative and terse. "Name the intuition the fact breaks," not "This section should describe the intuition that the fact breaks." Active verb first.

**Punctuation.** Comments obey the em-dash ban from `STYLE_GUIDE_LONGFORM.md`. Use commas, colons, parentheses, or two sentences. Write numeric ranges with a plain hyphen (3-5), never an en-dash. The generation model mirrors the punctuation it reads in the comments, so an em-dash in a comment is an em-dash risk in the output.

---

## 6. File-header standard

Rules true for **all** sections live once at the top of the file, never repeated per section. The header is the same across all seven skeletons except for the format name, accent color, the one-line format thesis, and the post-shape spine. It carries:

- Format name, one-line thesis, accent color hex.
- **Output contract:** output valid JSON only; strip every `//` comment and use no trailing commas; fill or omit each placeholder, never emit an empty string; drop unused OPTIONAL section objects entirely.
- **Order contract:** keep each section's `type` and `order` exactly as given; the renderer sorts by `order`, so gaps from dropped sections are expected, do not renumber to close them.
- **Post shape:** the always-present spine of REQUIRED sections, the rule that OPTIONAL sections are included only by their own Include test and never by default, and a realistic fullness band in sections and minutes. This is the directive that keeps a bulk run from either maxing out every optional (bloat) or producing thin posts. The per-section Include/Skip tests alone are not enough to make whole-post fullness consistent across many generations; without the spine and the band, fullness drifts run to run.
- **Visual plan:** how many visuals a post carries, that they are distributed and never crowded, which section always carries one, and the test for adding more. It also names the kinds of anchor a format allows (a data graphic, an illustrative licensed image that is anchored to the subject, a portrait) and states that the feed card always carries a small square anchor (a licensed image or an emblem SVG). Visual *placement* is a structural property and lives here, in the header. How a drawn visual *looks* lives in `SVG_STANDARD.md`; how a sourced image is licensed, attributed, and shown lives in `IMAGE_STANDARD.md`; caption and label *wording* lives in `STYLE_GUIDE_LONGFORM.md`. The header states only the placement plan and points to those for the rest.
- **The single inlined prose rule:** zero em-dashes in user-facing text (full prose rules in `STYLE_GUIDE_LONGFORM.md`).
- **Pointers:** see `DEEPSCROLL_CONTENT_STRUCTURE.md` for the spec, `STYLE_GUIDE_LONGFORM.md` for prose, `SVG_STANDARD.md` for diagrams.

Anything a section comment would otherwise repeat in every block belongs in this header instead.

---

## 7. What never goes in a comment

- Restated prose blacklists or style rules that already live in the style guide.
- Design rationale or history ("we moved this earlier because readers dropped off"). That is spec material.
- Vague value language: "make it engaging", "add real value", "where appropriate", "if it makes sense". Replace with a testable condition or delete.
- Praise of the format or motivational filler.
- More than one `Avoid:` per field.
- Bare numbers without `HARD:` or `Guideline:`.

---

## 8. Conflict precedence

When instructions appear to conflict, resolve in this fixed order so two models reach the same result:

1. `HARD:` constraints win over everything. They are structural law.
2. The section's **JOB** and **BOUNDARY** win over field-level guidelines. If hitting a length guideline would force the section outside its job or into another section's territory, the job wins.
3. **Content quality wins over any `Guideline:` count.** A guideline is never a reason to pad or truncate.
4. For prose questions not covered by a section comment, `STYLE_GUIDE_LONGFORM.md` governs.

---

## 9. Worked example

A real Facts section, before and after, showing the difference between a comment that lets the model drift and one that holds it.

**Weak (old style, drift-prone):**

```jsonc
{
  "type": "angles",  // Multiple Angles (OPTIONAL)
  "order": 9,
  // array[3-7]. Each angle covers one dimension of the fact: a
  // consequence, a mechanism, an edge case, a related finding.
  // Skip for narrow point-facts.
  "content": [ ... ]
}
```

Problems: `array[3-7]` reads as a hard floor of three, so the model pads. "a mechanism" invites it to retell the discovery that `story` already owns, producing the double-coverage we found. "Skip for narrow point-facts" is the only test and it is vague.

**Optimal (this standard):**

```jsonc
{
  "type": "angles",  // Multiple Angles (OPTIONAL)
  "order": 9,
  // JOB: give the reader the genuinely distinct wrinkles of the fact:
  //      consequences, edge cases, limits, adjacent comparisons. A reader
  //      who stops here should feel the fact has more sides than expected.
  // Include when: the fact has at least two dimensions as strong as the
  //   headline itself.
  // Skip when: you cannot name two that hold their own; a padded angle is
  //   worse than none.
  // Owns: consequences and edge cases. Not here: who discovered it, when,
  //   how (belongs to story). Never restate the discovery as an angle.
  "content": [
    {
      "title": "",  // string. Guideline: 4-10 words, a claim with a verb.
                    // Avoid: label-style titles ("The exception") and
                    // repeating the same opening word across angles.
      "body": "",   // string. Guideline: 2-4 sentences, concrete before abstract.
      "visual_svg": "", // string | omit. Per SVG_STANDARD.md.
      "image_url": ""   // string | omit.
    }
    // Guideline: up to 5 distinct angles. The last must be as strong as the
    // first or cut it. No HARD floor; quality of the dimension decides.
  ]
}
```

The optimal version states the job, makes the include/skip mechanical, draws the boundary against `story` on the side where the overlap happens, and replaces the misread `array[3-7]` floor with a quality test.

---

## 10. Graph and identity fields (all formats)

Every post is a node in the Plexive graph. Edges are the connections one post
declares to others. These rules are identical across all seven formats; a
format never invents its own linking scheme.

**Identity.** The system assigns each post an integer `id` on insert and derives
a readable URL slug. The generator writes neither. What the generator writes is
the post's content plus the fields below. Posts are matched to one another by
**natural identity**, stated in structured form, never by a guessed id:

- people: name plus birth year, e.g. `{ "name": "Max Kleiber", "birth_year": 1893 }`
- books: title plus author, e.g. `{ "title": "Scale", "author": "Geoffrey West" }`
- concepts, facts, stories, questions, academy: the title, e.g. `{ "title": "Regression to the Mean" }`

A natural identity is a fact the post already states, not an address to invent.
That is the whole point: a generator states what it knows (a real name, a real
title), it never fabricates a handle. This mirrors integrity rule A2 in
`STYLE_GUIDE_LONGFORM.md`: a made-up reference is as bad as a made-up number.

**`tags` (top-level array, REQUIRED).** One to four slugs drawn ONLY from the
fixed taxonomy (never invent a tag). The first is the primary topic and matches
`feed_card.field`. Multiple tags are encouraged where genuinely on-topic; do not
pad. Tags drive thematic clustering in the graph.

**`connections` (top-level array, REQUIRED, may be empty).** Every real link to
another post that is NOT already a `key_figure`. Each entry:
`{ "format": "", "ref": { ... }, "featured": false }` where `ref` is the
target's natural identity as a structured object, not a pre-joined string, shaped
by the target's format: people `{ "name": "", "birth_year": 0 }`, books
`{ "title": "", "author": "" }`, any other format `{ "title": "" }`.
`featured: true` marks the few links shown in the in-post "read next" strip
(cap 3, shared with featured key_figures). `connections` is otherwise unbounded,
but list only links that are genuinely about the same subject. Never invent a
target to inflate the graph.

**Person edges come from `key_figures`, not duplicated in `connections`.** Each
key figure carries `birth_year` (integer, for matching; omit if genuinely
unknown, never guess) and an optional `featured` (to surface that person in
"read next"). A person who appears as a key figure is already an edge; do not
also list them under `connections`.

**Latent edges.** A connection whose target post does not exist yet is kept as
written. The system activates it automatically when a post with the matching
natural identity is later created. The generator does nothing special for this:
it states the real identity, and the edge waits. Because identity is a stated
fact and not a guessed slug, the match is robust.

**Node identity and disambiguation are the system's job, not the generator's.**
The system normalizes each post's stated identity into an `identity_key`, and a
node is the pair `(format, identity_key)`, not a globally unique value. Because
every edge carries `format`, identities never collide across formats: a Books
post "Scale" and a Concepts post "Scale" are different nodes. Collisions are
possible, and flagged, only within one format; when two posts in the same format
share an `identity_key`, the system flags it on insert and a human adds a third
discriminator (field or country) to those two posts only. Generators never
pre-guess discriminators and never append a year "just in case"; they state the
plain natural identity every time.

Checklist for these fields:

- [ ] `tags` present, 1-4, all from the fixed taxonomy, first matches `field`.
- [ ] `connections` present (may be empty); each is a real link with a stated
      structured `ref`, no invented targets.
- [ ] Person links live in `key_figures` with `birth_year`, not duplicated in
      `connections`.
- [ ] At most three items total are `featured` across key figures and connections.

---

## 11. Reviewer checklist

Before a skeleton is considered done, every section comment passes:

- [ ] Header line names the section title and `(REQUIRED)` or `(OPTIONAL)`, no em-dash.
- [ ] A one-sentence JOB line with a drop-off note is present.
- [ ] OPTIONAL sections have both an `Include when` and a `Skip when`, each testable.
- [ ] Every overlap risk has a `Owns` / `Not here` boundary on both sides.
- [ ] Every number is tagged `HARD:` or `Guideline:`.
- [ ] No bare value language ("add value", "where appropriate").
- [ ] At most one `Avoid:` per field, naming the real failure mode.
- [ ] No prose blacklist restated; prose rules referenced, not copied.
- [ ] No em-dashes anywhere in the comments; ranges use plain hyphens.
- [ ] Universal rules are in the file header, not repeated per section.

And the file header passes:

- [ ] Header states the post shape: the required spine, the optional-selection rule, and a realistic fullness band in sections and minutes.
- [ ] Header states the visual plan: how many, distributed, which section always carries one, and the test for more; placement here, look in `SVG_STANDARD.md`, wording in `STYLE_GUIDE_LONGFORM.md`.
