# Deepscroll — Long-Form Content Structure

Schema specification for Deepscroll's long-form post format. Used for:
1. Database schema design (`sections` JSON column on `posts` table)
2. Frontend renderer implementation (one component per section type)

**Core principle:** Substance hooks first, deep dive in the middle, reference material at the bottom. Every drop-off point should feel like a complete mini-experience, not a cliffhanger. The driver is **curiosity**, not provocation.

All content is in English. Localization comes later.

---

## 2. Implementation: Flexible Section Model

To allow adding, removing, and reordering sections later **without** wiping the database:

### Database Schema (recommended for Claude Code)

The `posts` table for long-form posts:

```sql
posts (
  id              INTEGER PRIMARY KEY,
  format          TEXT NOT NULL,                    -- 'books' | 'facts' | 'people' | 'concepts' | 'questions' | 'stories' | 'academy'
  title           TEXT NOT NULL,                    -- display title (derived from the feed card on seed)
  feed_card       JSON NOT NULL,                    -- the feed card object (fields vary per format)
  sections        JSON NOT NULL,                    -- ordered array of section objects
  tags            JSON NOT NULL DEFAULT '[]',       -- taxonomy slugs (graph field)
  connections     JSON NOT NULL DEFAULT '[]',       -- cross-post links (graph field)
  status          TEXT NOT NULL DEFAULT 'published', -- 'published' | 'pending'
  author_id       INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW,
  slug            TEXT UNIQUE,                       -- nullable; set for seed/official content (the JSON filename stem), NULL for user content
  is_user_content BOOLEAN NOT NULL DEFAULT false    -- false for official/seed content, true for user submissions
)
```

Recommended indexes:
- `format` (feed filtering per tab)
- `slug` (seed upsert key, already UNIQUE)
- `author_id` (My Posts view)
- `status` (filter out pending submissions from feed)
- `created_at` (feed ordering)

Validation (REQUIRED sections present, correct shapes) happens at editor / post creation time via Pydantic schemas — not as DB constraints. This keeps the DB tolerant to schema evolution.

### Section JSON Structure

Each section in the `sections` array is an object:

```json
{
  "type": "essence",
  "order": 1,
  "content": "..."
}
```

`type` is the section identifier (one of the documented type strings per format). `order` controls render position. `content` shape varies per type — see the per-format `.jsonc` skeletons for each format's section contracts, and section 3 below for the shapes shared across formats.

### Frontend Renderer

A `<SectionRenderer>` component dispatches on `type` to load the matching sub-component. An unknown `type` is skipped so the post still renders; the renderer logs a `console.warn` for it (a dev-facing notice, not a user-facing error). This keeps the model forward-compatible.

### Benefits of this model

- New section type → only a new renderer in the frontend, no DB migration
- Remove a section → only delete a JSON entry, other posts unaffected
- Reorder → only change `order` values
- REQUIRED/OPTIONAL is editor-side validation, not a DB constraint

An earlier short-form schema carried per-field columns (`hook`, `key_points`, `details`, etc.). These were removed; long-form posts store all content in `feed_card` and `sections`, with no per-format columns on the table.

**Note on shared types across formats:** Some section types (e.g. `voices`, `at_a_glance`) are reused across formats with the same structure but different headers (e.g. "Voices from the Book" vs. "In Their Own Words"). The renderer maps `type + format` to a header string in code, not in the DB.

---

## 3. Shared Section Types

These section types are used across multiple formats with **identical** content shape. The frontend renderer maps `type + format` to a header string in code (e.g. `voices` renders as "Voices from the Book" for books, "In Their Own Words" for people).

| Type | Content shape | Purpose |
|---|---|---|
| `quiz` | array of `{question, options[4], answer_index, explanation}` | 5–10 multiple-choice questions, affects Elo |
| `sources` | array of `{label, url, type}` where type ∈ `wikipedia|paper|book|article|database` | References |
| `voices` | array of `{quote, attribution}` (length 3–4) | Quotes; header varies per format |

### Universal Post Metadata

`post_difficulty` appears in **every** format's feed card and `at_a_glance` section, with identical meaning:

- `post_difficulty` — 1, 2, or 3, where 1 = accessible, 2 = moderate, 3 = demanding. Note: for Academy, the scale shifts to expert-level (1 = adjacent fields, 3 = subfield specialist)

Reading time is computed, not authored. The card footer and the at-a-glance reading time are computed on the server at serialization time from the post's reader-facing text and delivered as the `reading_minutes` field (so feed cards get it even though list endpoints drop the section bodies): the total word count divided by 230 words per minute, rounded to the nearest minute, with a floor of 1. All reader-facing text counts: section bodies, chapter titles and bodies, the_turn / setting / aftermath bodies, what_it_means, unanswered, historical_context, quiz questions, options, and explanations, image captions, cast roles and one-line descriptions, source labels, and the at-a-glance string values. Non-text interaction time is deliberately not modeled, so one rule holds across all formats. Posts do not carry a post_reading_time_min field; a stored estimate drifts from the content and is not used.

### `at_a_glance` — Same Type, Format-Specific Fields

`at_a_glance` is intentionally **not** in the shared types table above. It is a *generic container*: the type name and visual position are constant, but the fields inside vary by format. The frontend renderer iterates over the key-value pairs and renders them as a card. This allows each format to surface the metadata most relevant to its content (Books: pages, year, genre; People: birth/death, nationality, field; Academy: study type, pre-registration, replication status; etc.).

### Person-List Shape

These section types reference lists of people (`key_figures` in Facts/`story`, `cast` in Stories, `authors_context` in Academy, `key_thinkers` in Concepts/`origin`). They share a **base shape** that may be extended:

```
{
  name: string,
  birth_year: integer,     // identity for person-edge matching; omit only if genuinely unknown, never guess
  role: string,            // their function in the context
  one_line?: string,       // optional brief description
  lifespan?: string,       // optional "1867-1934" or "1929-present"
  image_url?: string,      // Wikimedia portrait or similar
  affiliation?: string,    // for academic context
  featured?: boolean       // optional; surfaces this person in the in-post "read next" strip
}
```

Different sections use different subsets of this shape, but never invent new field names for the same concept.

Each person-list entry is a **person edge** in the graph: `name` plus `birth_year` is the target identity, and `featured` flags the few surfaced in "read next". For a format that has a person-list, its person edges live here, not in `connections`; a person in the list is never duplicated there.

### Graph Fields (all formats)

`tags` and `connections` are the two top-level graph fields (see the schema table at the top of this section). `tags` are taxonomy slugs that drive thematic clustering at runtime; they are never edges. `connections` is an array of structured edges, each `{ format, ref, featured }`, where `ref` carries the target's identity parts as a structured object, not a pre-joined string. This replaces the former `related_posts` section type.

When a format has a person-list field (`key_figures`, `key_thinkers`, `cast`, `authors_context`), its person edges live there, not in `connections`. The two formats with no person-list, People and Books, link a person through a `connections` entry with `format: "people"` and `ref { name, birth_year }`. So `connections` carries every non-person link, plus person links only for those person-list-less formats; a person already in a person-list is never duplicated.

Each format states its own identity in structured form: the People `feed_card` carries `birth_year` (integer); Books carries title plus author; the other formats use the title.

The full per-format `ref` shapes and the edge and identity-matching semantics (latent edges, the derived `identity_key`, the featured cap) live in `SKELETON_COMMENT_STANDARD.md` section 10.

---

## 5. Forward Compatibility Rules

The flexible section model only works if the frontend renderer is **robust**. These rules apply to the implementation:

1. **Unknown section types are skipped, and the post still renders.** If the backend returns a section with `type: "audio_clip"` and no renderer exists for that type, the post renders fine and that section just doesn't appear. The renderer logs a `console.warn` for the unknown type (a dev-facing notice); there is no user-facing error.

2. **Missing optional fields don't crash the renderer.** A section like `{type: "core_ideas", content: [...]}` where individual items have `visual_svg` but no `image_url` (or vice versa, or neither) must render correctly.

3. **Extra fields are ignored, not rejected.** If a new field is added to a section type (e.g. `audio_url` added to `voices`), older renderer code that doesn't know the field simply ignores it. The post stays valid.

4. **Sections render in `order` value, not array position.** This allows reordering without rebuilding posts — just change the `order` values.

5. **REQUIRED is enforced at editor/validation time, not at render time.** A post missing a required section still renders what it has. Validation happens when posts are submitted/edited.

**Note: `related_posts` was removed as a hard cut.** It is no longer a section type; internal links are now edges in `connections` and the person-list fields (see section 3). Any legacy post still carrying a `related_posts` section is handled by rule 1: no renderer exists for that type, so it is skipped and the post still renders.

### What this allows without DB migration

- **Adding a new section type** → only a new renderer component
- **Adding fields to an existing section** → only renderer update (old posts continue working)
- **Changing array length limits** (e.g. core_ideas from 6–12 to 6–15) → only prompt update + editor validation
- **Reordering sections** → only `order` values in new posts
- **Removing a section type** → just stop creating it; existing posts continue rendering (or remove renderer → skipped with a dev-facing console.warn)

### What requires migration (rare cases)

- Changing a field's *data type* (e.g. `post_difficulty` from integer to string) — would need to update all existing posts
- Renaming a section type string (e.g. `core_ideas` → `key_ideas`) — would need a one-time SQL `UPDATE` to rewrite the type names in existing JSON
- These cases should be avoided; if they occur, a simple migration script can update all rows in one pass
