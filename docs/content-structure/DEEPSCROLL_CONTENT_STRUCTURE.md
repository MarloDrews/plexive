# Deepscroll — Long-Form Content Structure

Schema specification for Deepscroll's long-form post format. Used for:
1. Database schema design (`sections` JSON column on `posts` table)
2. Frontend renderer implementation (one component per section type)
3. Post Creation Page: per-format AI generation prompts users copy when drafting a post with AI assistance
4. Bulk content seeding via Claude Research (separate master prompt — to be added later)

**Core principle:** Substance hooks first, deep dive in the middle, reference material at the bottom. Every drop-off point should feel like a complete mini-experience, not a cliffhanger. The driver is **curiosity**, not provocation.

All content is in English. Localization comes later.

---

## Format Overview

Quick reference for all 7 formats. Each format has its own logic but follows the same overall principle (substance first, deep dive middle, context last, mandatory quiz).

| Format | Tab | Core logic | Sections (req/total) | Reading time |
|---|---|---|---|---|
| Books | Books | Promise *about* a work; quotes early, core ideas as heart | 8 / 15 | 6–20 min |
| Facts | Facts | The fact *is* the hook; visual is constitutive | 7 / 14 | 5–15 min |
| People | People | Portrait + life arc carry the narrative | 9 / 16 | 7–18 min |
| Concepts | Ideas | Understanding the reader can actually apply | 8 / 15 | 5–17 min |
| Questions | Q&A | Steelmanned multi-perspective reflection; no "right answer" | 8 / 15 | 5–17 min |
| Stories | Stories | Narrative *is* the substance; spoiler discipline | 8 / 15 | 5–17 min |
| Academy | Academy | Research paper summary for domain experts | 12 / 23 | 7–18 min |

All formats end with a REQUIRED quiz (5–10 questions, Elo-relevant).

---

## 1. Style Guide

Format-agnostic rules. These are what separate Deepscroll from Wikipedia.

1. **Speak directly.** Use "you", "we", active verbs. Avoid "it has been shown that".
2. **Take a stance.** "This is Kahneman's strongest argument" beats "Kahneman argues that…". Curated selection with a clear point of view.
3. **Concrete before abstract.** Example first, then the rule.
4. **Show, don't tell.** Don't claim something is fascinating — demonstrate why.
5. **Respect hierarchy.** Most compelling material on top, mandatory context at the bottom. Never bury a bombshell in section 12.
6. **Use lists sparingly.** When prose flows better, use prose. Lists only when content is genuinely enumerative.
7. **No Wikipedia hedging.** Avoid "some have argued that possibly". Make clear claims with sources.
8. **Distribute visuals.** Not one diagram on top — spread across the post. Prefer Wikimedia Commons and royalty-free images. Diagrams as SVGs following the SVG standard.
9. **No buzzword vocabulary.** "Game-changing", "revolutionary", "mind-blowing" are banned. Substance over adjectives.
10. **Honest reading time.** If a post takes 8 minutes, say 8. Don't undersell to lure readers.

---

## 2. Implementation: Flexible Section Model

To allow adding, removing, and reordering sections later **without** wiping the database:

### Database Schema (recommended for Claude Code)

The `posts` table for long-form posts:

```sql
posts (
  id              INTEGER PRIMARY KEY,
  format          TEXT NOT NULL,           -- 'books' | 'facts' | 'people' | 'concepts' | 'questions' | 'stories' | 'academy'
  slug            TEXT UNIQUE NOT NULL,    -- URL-friendly identifier
  feed_card       JSON NOT NULL,           -- the feed card object (fields vary per format)
  sections        JSON NOT NULL,           -- ordered array of section objects
  status          TEXT DEFAULT 'published', -- 'published' | 'pending'
  author_id       INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW,
  updated_at      TIMESTAMP DEFAULT NOW
)
```

Recommended indexes:
- `format` (feed filtering per tab)
- `slug` (URL lookup, already UNIQUE)
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

`type` is the section identifier (one of the documented type strings per format). `order` controls render position. `content` shape varies per type — documented per section below.

### Frontend Renderer

A `<SectionRenderer>` component dispatches on `type` to load the matching sub-component. Unknown types are silently skipped (forward-compatible).

### Benefits of this model

- New section type → only a new renderer in the frontend, no DB migration
- Remove a section → only delete a JSON entry, other posts unaffected
- Reorder → only change `order` values
- REQUIRED/OPTIONAL is editor-side validation, not a DB constraint

Existing legacy fields on `posts` (`hook`, `key_points`, `details` etc.) remain for backward compatibility with short-form posts but are not used for new long-form posts.

**Note on shared types across formats:** Some section types (e.g. `voices`, `at_a_glance`) are reused across formats with the same structure but different headers (e.g. "Voices from the Book" vs. "In Their Own Words"). The renderer maps `type + format` to a header string in code, not in the DB.

---

## 3. Shared Section Types

These section types are used across multiple formats with **identical** content shape. The frontend renderer maps `type + format` to a header string in code (e.g. `voices` renders as "Voices from the Book" for books, "In Their Own Words" for people).

| Type | Content shape | Purpose |
|---|---|---|
| `quiz` | array of `{question, options[4], answer_index, explanation}` | 5–10 multiple-choice questions, affects Elo |
| `related_posts` | array of `{post_id, title, format, mini_teaser}` (length 3) | Internal links to similar posts |
| `sources` | array of `{label, url, type}` where type ∈ `wikipedia|paper|book|article|database` | References |
| `voices` | array of `{quote, attribution}` (length 3–4) | Quotes; header varies per format |

### Universal Post Metadata

Two fields appear in **every** format's feed card and `at_a_glance` section, with identical meaning:

- `post_reading_time_min` — integer, minutes of reading the post itself (not the underlying material)
- `post_difficulty` — 1, 2, or 3, where 1 = accessible, 2 = moderate, 3 = demanding. Note: for Academy, the scale shifts to expert-level (1 = adjacent fields, 3 = subfield specialist)

### `at_a_glance` — Same Type, Format-Specific Fields

`at_a_glance` is intentionally **not** in the shared types table above. It is a *generic container*: the type name and visual position are constant, but the fields inside vary by format. The frontend renderer iterates over the key-value pairs and renders them as a card. This allows each format to surface the metadata most relevant to its content (Books: pages, year, genre; People: birth/death, nationality, field; Academy: study type, pre-registration, replication status; etc.).

### Person-List Shape

Two section types reference lists of people (`key_figures` in Facts/`story`, `cast` in Stories, `authors_context` in Academy, `key_thinkers` in Concepts/`origin`). They share a **base shape** that may be extended:

```
{
  name: string,
  role: string,            // their function in the context
  one_line?: string,       // optional brief description
  lifespan?: string,       // optional "1867–1934" or "1929–present"
  image_url?: string,      // Wikimedia portrait or similar
  affiliation?: string     // for academic context
}
```

Different sections use different subsets of this shape — but never invent new field names for the same concept.

---

## 4. Visual Conventions

Every section that may contain a visual element uses the same four field names. This makes the frontend renderer trivial: one `<VisualBlock>` component handles all cases.

| Field | Type | Purpose |
|---|---|---|
| `visual_svg` | string (optional) | Inline SVG following the project SVG standard |
| `image_url` | string (optional) | URL to a Wikimedia Commons or royalty-free image |
| `image_caption` | string (optional) | Caption shown below the visual |
| `image_attribution` | string (optional) | License/source credit for the image (essential for Wikimedia compliance) |

**Rules:**
- A section may have neither, one, or both of `visual_svg` and `image_url`
- `image_caption` and `image_attribution` apply to both
- The renderer prefers `visual_svg` over `image_url` if both are present (SVGs scale crisply)
- For SVGs: `viewBox="0 0 400 300"`, `currentColor` for neutral elements, fixed accent color for highlights, no shadows/filters/gradients

**Not part of Visual Conventions:**
- `formalism` section in Academy uses `equations` (array of LaTeX strings) — that's a separate primitive, not a visual
- `card_visual` (Facts feed card) — the small field glyph at the right end of the field line on the typographic card `{image_url?, image_attribution?, svg?}`; on Facts fill `svg` only (image_url is for books/people covers); different context from in-post visuals, kept as its own field (see IMAGE_STANDARD.md, LAYOUT_STANDARD.md, SVG_STANDARD.md card rules)

---

## 5. Forward Compatibility Rules

The flexible section model only works if the frontend renderer is **robust**. These rules apply to the implementation:

1. **Unknown section types are silently skipped.** If the backend returns a section with `type: "audio_clip"` and no renderer exists for that type, the post still renders — the section just doesn't appear. No errors, no warnings to users.

2. **Missing optional fields don't crash the renderer.** A section like `{type: "core_ideas", content: [...]}` where individual items have `visual_svg` but no `image_url` (or vice versa, or neither) must render correctly.

3. **Extra fields are ignored, not rejected.** If a new field is added to a section type (e.g. `audio_url` added to `voices`), older renderer code that doesn't know the field simply ignores it. The post stays valid.

4. **Sections render in `order` value, not array position.** This allows reordering without rebuilding posts — just change the `order` values.

5. **REQUIRED is enforced at editor/validation time, not at render time.** A post missing a required section still renders what it has. Validation happens when posts are submitted/edited.

### What this allows without DB migration

- **Adding a new section type** → only a new renderer component
- **Adding fields to an existing section** → only renderer update (old posts continue working)
- **Changing array length limits** (e.g. core_ideas from 6–12 to 6–15) → only prompt update + editor validation
- **Reordering sections** → only `order` values in new posts
- **Removing a section type** → just stop creating it; existing posts continue rendering (or remove renderer → silent skip)

### What requires migration (rare cases)

- Changing a field's *data type* (e.g. `post_reading_time_min` from integer to string) — would need to update all existing posts
- Renaming a section type string (e.g. `core_ideas` → `key_ideas`) — would need a one-time SQL `UPDATE` to rewrite the type names in existing JSON
- These cases should be avoided; if they occur, a simple migration script can update all rows in one pass

---

# Format: Books

## Feed Card (Pre-Click)

What the user sees in the feed *before* tapping. Must catch within 2 seconds. Like a YouTube thumbnail, but textual.

| Element | Description |
|---|---|
| `cover` | Book cover image, left, large. Open Library API. Placeholder with format color if unavailable |
| `title` | Book title, primary typography |
| `author` | Author name, secondary typography |
| `essence` | One sentence stating what the book is. Factual and dense, no clickbait |
| `teasers` | 3 teaser bullets, max ~6 words each. For non-fiction: concepts ("Habit Stacking", "The 1% Rule"). For fiction: themes ("Guilt without punishment", "Übermensch theory") |
| `meta` | `post_reading_time_min` · `post_difficulty (1–3)` · `year` · `genre` |

**Tone of the card:** Promise substance, not drama. The reader should think "there's something in here" — not "what the hell?".

## Detail View Sections

### Part 1 — The Opening (~90 sec read)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 1 | `essence` | **Essence** — one dense sentence, large typography, white space | REQUIRED | `string` |
| 3 | `voices` | **Voices from the Book** — 3–4 quotes from the book, large typography, minimal attribution (~5 words max, e.g. "— on habits"). Quote length flexible | REQUIRED | array of `{quote, attribution}` |
| 4 | `at_a_glance` | **At a Glance** — visual card: genre · year · country · pages · reading_ease (1–3) · post_reading_time_min · post_difficulty (1–3) · best_for (one line: "Readers who…") | REQUIRED | object |

### Part 2 — The Overview (~2 min read)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 5 | `why_endures` | **Why This Book Endures** — 2–3 sentences: what makes *this* book special? | OPTIONAL | `string` |
| 6 | `heart` | **The Heart of It** — paragraph (4–6 sentences) on central argument (non-fiction) or central question (fiction) | REQUIRED | `string` |
| 7 | `structure` | **How It's Built** — short structural map. Non-fiction: major arguments. Fiction: acts without twist spoilers. Each point one sentence | OPTIONAL | array of `string` |

### Part 3 — The Core

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 8 | `core_ideas` | **The Core Ideas / Central Themes** — 6 to 12 sections, flexible count. Each with pointed heading + 3–6 sentences + optional visual/quote/example. Non-fiction: optional "In practice" line. Fiction: optional "What [author] is saying" line | REQUIRED | array of `{title, body, in_practice?, visual_svg?, image_url?, quote?}` (length 6–12) |

### Part 4 — What Stays With You

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 9 | `takeaway` | **What Stays With You** — Non-fiction: one framework/tool/rule with diagram, applicable from tomorrow. Fiction: one central question, meditatively set, plus 2–3 sentences on how the book treats it | REQUIRED | `{body, visual_svg?, framing}` where framing ∈ `framework|question` |

### Part 5 — Test Yourself

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 10 | `quiz` | **Quiz** — 5–10 multiple-choice questions | REQUIRED | (shared shape) |
| 11 | `related_posts` | **If You Liked This** — 3 internal links with mini-cover. Right after quiz | OPTIONAL | (shared shape) |

### Part 6 — Context (smaller typography, secondary)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 12 | `world_context` | **The World It Came From** — era, intellectual movement | OPTIONAL | `string` |
| 13 | `author_context` | **About the Author** — 2–3 sentences + Wikimedia portrait | OPTIONAL | `{body, image_url?, image_attribution?, wikipedia_url?}` |
| 14 | `critique` | **Critique & Limitations** — Non-fiction: research state, refutations. Fiction: literary critique | OPTIONAL | `string` |
| 15 | `sources` | **Sources & Further Reading** | REQUIRED | (shared shape) |

## Size & Tension

- **Minimal post:** 8 required sections + ~5 core ideas ≈ 13 blocks (~6–8 min)
- **Maximal post:** all 15 + 12 core ideas ≈ 26 blocks (~15–20 min)

```
HOOK (Essence + Quiz promise)
  ↓
TASTE (Voices)
  ↓
ORIENTATION (At a Glance → Heart → Structure)
  ↓
DEEP DIVE (Core Ideas, 6–12)
  ↓
TAKEAWAY (What Stays With You)
  ↓
TEST (Quiz)
  ↓
NEXT HOOK (Related)
  ↓
CONTEXT (World → Author → Critique)
  ↓
ONWARDS (Sources)
```

## AI Generation Prompt — Books

Lives on the Post Creation page. User copies this prompt, appends source material, runs it in an AI chat.

```
You are writing a Deepscroll long-form post about a book. Deepscroll is an open social media app whose feed replaces doomscrolling with valuable content. Output must be a single JSON object that follows the schema below exactly.

PRINCIPLE
The driver is curiosity, not provocation. Substance comes first, deep dive in the middle, mandatory context at the bottom. Each drop-off point in the post should still feel like a complete mini-experience.

STYLE RULES
1. Speak directly: "you", "we", active verbs. No "it has been shown that".
2. Take a stance with clear point of view, not Wikipedia neutrality.
3. Concrete before abstract: example first, then the rule.
4. Show, don't tell — demonstrate, don't claim.
5. Respect hierarchy: best material first, mandatory last.
6. Use lists sparingly; prefer prose when it flows better.
7. No Wikipedia hedging; make clear claims and cite them.
8. Distribute visuals across the post. Prefer Wikimedia Commons or royalty-free images. Diagrams as SVG (viewBox "0 0 400 300", currentColor for neutral elements, no shadows or gradients).
9. No buzzword vocabulary ("game-changing", "revolutionary", "mind-blowing" etc.).
10. Honest reading time — match the actual read length, don't undersell.

LANGUAGE
English only.

OUTPUT FORMAT
Return exactly one JSON object:
{
  "feed_card": { ... },
  "sections": [ { "type": "...", "order": N, "content": ... }, ... ]
}

FEED CARD
{
  "cover_url": string (Open Library or other source) or null,
  "title": string,
  "author": string,
  "essence": string (one sentence, dense, no clickbait),
  "teasers": [string, string, string] (each ~6 words; concepts for non-fiction, themes for fiction),
  "post_reading_time_min": integer,
  "post_difficulty": 1 | 2 | 3,
  "year": integer (publication year),
  "genre": string
}

SECTIONS
Include every REQUIRED section. For each OPTIONAL section, include it only if it adds real value for this specific book. Use this order:

1. essence — REQUIRED. content: string. One dense sentence stating what the book is.
3. voices — REQUIRED. content: array of {quote, attribution}, length 3–4. Quotes from the book. Attribution max ~5 words ("— on habits", "— Raskolnikov to Sonya"). Quote length flexible.
4. at_a_glance — REQUIRED. content: { genre, year, country, pages, reading_ease (1-3), post_reading_time_min, post_difficulty (1-3), best_for (one line "Readers who…") }.
5. why_endures — OPTIONAL. content: string, 2–3 sentences. What makes this book special among all books on its topic? Skip if you don't have a sharp answer.
6. heart — REQUIRED. content: string, 4–6 sentences. The central argument (non-fiction) or central question (fiction). Whoever reads only this section gets the essence.
7. structure — OPTIONAL. content: array of strings, one sentence each. Major arguments (non-fiction), acts without twist spoilers (fiction), or central concepts (essay).
8. core_ideas — REQUIRED. content: array of length 6–12, each item { title (pointed heading), body (3–6 sentences), in_practice? (optional one-line application for non-fiction), visual_svg? (optional SVG string), image_url? (optional Wikimedia URL), quote? (optional supporting book quote) }. Pick the count based on the book's richness, not by filling a target.
9. takeaway — REQUIRED. content: { framing: "framework" | "question", body: string, visual_svg?: string }. Non-fiction: one framework/rule applicable from tomorrow (framing="framework"). Fiction: one central question to sit with, plus 2–3 sentences on how the book treats it (framing="question").
10. quiz — REQUIRED. content: array of length 5–10, each item { question, options (length 4), answer_index (0–3), explanation (one sentence) }. Questions should test understanding of core ideas, not memorize trivia.
11. related_posts — OPTIONAL. content: array of length 3, each item { post_id (leave empty string if not known), title, format, mini_teaser (one sentence) }.
12. world_context — OPTIONAL. content: string. Era, intellectual movement, what was new. Longer for classics, shorter or skip for modern non-fiction.
13. author_context — OPTIONAL. content: { body (2–3 sentences, only book-relevant biography), image_url?, image_attribution?, wikipedia_url? }. Skip if author is irrelevant to understanding the book.
14. critique — OPTIONAL. content: string. Non-fiction: current research state, refutations, what's been superseded. Fiction: literary critique, problematic passages.
15. sources — REQUIRED. content: array of { label, url, type } where type ∈ "wikipedia", "paper", "book", "article", "database".

INSTRUCTIONS
Generate the JSON post based on the source material I paste below. If the material is incomplete, use what you know about the book to fill in, but cite carefully.

SOURCE MATERIAL:
[Paste book notes, summary, full text, ISBN, or any other relevant material here]
```

---

# Format: Facts

## Feed Card (Pre-Click)

| Element | Description |
|---|---|
| `card_visual` | Small field glyph (`svg`, compact viewBox e.g. 0 0 56 32) at the right end of the field line on the typographic card (see LAYOUT_STANDARD.md, SVG_STANDARD.md card rules) |
| `field` | Topic field shown small in the accent color at the left of the field line, with the glyph at its right ("Astronomy", "History", "Biology"…) |
| `headline` | The fact statement, full width, large, with key number in accent color |
| `teasers` | 3 teaser bullets ("How we measured it", "Why intuition fails here", "What it changed") |
| `meta` | `post_reading_time_min` · `post_difficulty (1–3)` |

**Tone of the card:** The fact itself does the pulling. No tricks around it.

## Top-Level Graph Fields

Beyond `feed_card` and `sections`, a Facts post carries two top-level graph fields (cross-format; full rules in `SKELETON_COMMENT_STANDARD.md` section 10):

| Field | Shape | Description |
|---|---|---|
| `tags` | array of `string` (1–4) | Taxonomy slugs from the fixed list only; the first is primary and matches `feed_card.field` |
| `connections` | array of `{format, ref, featured}` (may be empty) | Links to other posts that are not key figures; `ref` is the target's natural identity; `featured: true` surfaces it in "read next" |

The in-post "read next" list is built from featured `connections` plus featured `story.key_figures` (cap 3 total). There is no `related_posts` section.

## Detail View Sections

### Part 1 — The Punch (~60 sec read)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 1 | `headline` | **The Headline** — the fact stated cleanly, large typography, key number in accent | REQUIRED | `string` |
| 3 | `see_it` | **See It** — the main visual. SVG diagram, size comparison, timeline, map, or structural sketch | REQUIRED | `{visual_svg?, image_url?, image_caption?, image_attribution?}` |
| 4 | `key_numbers` | **Key Numbers** — compact card with all relevant numbers | OPTIONAL | array of `{label, value, unit?}` |
| 5 | `tangible` | **Make It Tangible** — 2–3 concrete comparisons ("That's like…", "Equivalent to…") + optional scale/timeline SVG | OPTIONAL | `{items: array of string, visual_svg?}` |

### Part 2 — Why It's True

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 6 | `how_we_know` | **How We Know** — adaptive: empirical measurement, mathematical proof, or skip for constructs. 3–5 sentences | OPTIONAL | `string` |

### Part 3 — Depth & Meaning (~3–6 min, the core)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 7 | `surprises` | **Why It Surprises Us** — the aha moment. Which intuition does the fact break? | REQUIRED | `string` |
| 8 | `angles` | **Multiple Angles** — 3–7 different aspects/dimensions, each briefly explained. Each angle may have its own visual | OPTIONAL | array of `{title, body, visual_svg?, image_url?, image_caption?, image_attribution?}` (length 3–7) |
| 9 | `story` | **The Story Behind It** — discovery + prehistory merged. Who found this out, when, how? For constructs: "How it came to be" | REQUIRED | `{body, key_figures?: array of {name, role, one_line?, lifespan?, birth_year?, featured?, image_url?, image_attribution?}, visual_svg?, image_url?, image_caption?, image_attribution?}` |
| 10 | `bigger_picture` | **The Bigger Picture** — what the fact means scientifically, philosophically, practically. Climax before the quiz | REQUIRED | `string` |

### Part 4 — Test Yourself

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 11 | `quiz` | **Quiz** — 5–10 questions, Elo-relevant | REQUIRED | (shared shape) |

### Part 5 — Around (compact, secondary)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 13 | `misconceptions` | **Common Misconceptions** | OPTIONAL | array of `{myth, reality}` |
| 14 | `sources` | **Sources & Further Reading** | REQUIRED | (shared shape) |

## Visual Note (Facts-specific)

For Facts, visuals are *constitutive*, not decorative.
- Section 3 (`see_it`): one large prominent main visual
- Section 8 (`angles`): each angle may/should have its own mini-visual
- Section 9 (`story`): Wikimedia portraits of researchers, historical illustrations
- Section 10 (`bigger_picture`): another diagram welcome if it shows the implication

Images preferred Wikimedia Commons + royalty-free. Diagrams as SVGs per `SVG_STANDARD.md`; sourced images (licensing, attribution, display) per `IMAGE_STANDARD.md`.

## Size & Tension

- **Minimal post:** 7 required sections ≈ 8–10 blocks (~5 min)
- **Maximal post:** all 14 + 7 angles ≈ 20 blocks (~12–15 min)

```
PUNCH (Headline → Quiz promise → See It → Numbers → Tangible)
  ↓
TRUST (How We Know)
  ↓
INSIGHT (Surprises → Angles → Story → Bigger Picture)
  ↓
TEST (Quiz)
  ↓
NEXT HOOK (Related)
  ↓
CONTEXT (Misconceptions)
  ↓
ONWARDS (Sources)
```

## AI Generation Prompt — Facts

Lives on the Post Creation page. User copies this prompt, appends source material, runs it in an AI chat.

```
You are writing a Deepscroll long-form post about a fact. Deepscroll is an open social media app whose feed replaces doomscrolling with valuable content. Output must be a single JSON object that follows the schema below exactly.

PRINCIPLE
The driver is curiosity, not provocation. For facts, the fact itself is the hook — substance comes first, with the visual making the insight tangible immediately. Each drop-off point in the post should still feel like a complete mini-experience.

STYLE RULES
1. Speak directly: "you", "we", active verbs. No "it has been shown that".
2. Take a stance with clear point of view, not Wikipedia neutrality.
3. Concrete before abstract: example first, then the rule.
4. Show, don't tell — demonstrate, don't claim.
5. Respect hierarchy: best material first, mandatory last.
6. Use lists sparingly; prefer prose when it flows better.
7. No Wikipedia hedging; make clear claims and cite them.
8. Distribute visuals across the post. For facts, visuals are constitutive, not decorative. Prefer Wikimedia Commons or royalty-free images. Diagrams as SVG (viewBox "0 0 400 300", currentColor for neutral elements, no shadows or gradients).
9. No buzzword vocabulary ("game-changing", "revolutionary", "mind-blowing" etc.).
10. Honest reading time — match the actual read length, don't undersell.

LANGUAGE
English only.

OUTPUT FORMAT
Return exactly one JSON object:
{
  "feed_card": { ... },
  "sections": [ { "type": "...", "order": N, "content": ... }, ... ]
}

FEED CARD
{
  "field": string ("Astronomy", "History", "Biology", "Mathematics", etc.),
  "headline": string (the fact stated cleanly),
  "card_visual": { image_url?, image_attribution?, svg? } (small field glyph at the right end of the field line; on Facts fill svg only, compact viewBox. See LAYOUT_STANDARD.md, SVG_STANDARD.md card rules),
  "teasers": [string, string, string] (e.g. "How we measured it", "Why intuition fails", "What it changed"),
  "post_reading_time_min": integer,
  "post_difficulty": 1 | 2 | 3
}

TOP-LEVEL FIELDS (alongside feed_card and sections)
- tags: array of 1–4 taxonomy slugs from the fixed list only (never invent one). The first is primary and matches feed_card.field.
- connections: array (may be empty) of { format, ref, featured } linking to other posts that are not key figures. ref is the target's natural identity (people "Name (birth_year)", books "Title by Author", else the title/concept name). featured: true surfaces it in "read next" (cap 3, shared with featured key_figures). Never invent a target.

SECTIONS
Include every REQUIRED section. For each OPTIONAL section, include it only if it adds real value for this specific fact. Use this order:

1. headline — REQUIRED. content: string. The fact stated cleanly, with the key number/claim positioned for emphasis.
3. see_it — REQUIRED. content: { visual_svg?, image_url?, image_caption?, image_attribution? }. The main visual that makes the insight tangible. Use SVG for diagrams, scales, timelines, charts. Use image_url for historical images, maps, photos. One of visual_svg or image_url required.
4. key_numbers — OPTIONAL. content: array of { label, value, unit? }. Include when the fact involves multiple quantitative data points.
5. tangible — OPTIONAL. content: { items: array of strings (2–3 concrete comparisons), visual_svg? (optional scale/timeline graphic) }. Include for abstract scales (cosmic, microscopic, deep time). Skip when the fact is already tangible.
6. how_we_know — OPTIONAL. content: string, 3–5 sentences. For empirical facts: methodology/measurement. For mathematical truths: the proof or sketch of it. Skip for cultural/political constructs where there's nothing to "know" — they were established.
7. surprises — REQUIRED. content: string. Which intuition does the fact break? Why were we wrong before? This is what turns trivia into insight.
8. angles — OPTIONAL. content: array of length 3–7, each item { title, body (a few sentences), visual_svg?, image_url? }. Different aspects/dimensions of the fact. Include for rich facts with multiple sides; skip for narrow point-facts.
9. story — REQUIRED. content: { body, key_figures? (array of {name, role, one_line?, lifespan?, birth_year? (integer, graph match key), featured? (surfaces in "read next"), image_url?}), visual_svg?, image_url? }. Discovery and prehistory merged. Who found this out, when, how? What was believed before? For constructs: how the convention came about. Always something to say here.
10. bigger_picture — REQUIRED. content: string. What the fact means scientifically, philosophically, or practically. Where it leads. The climax before the quiz.
11. quiz — REQUIRED. content: array of length 5–10, each item { question, options (length 4), answer_index (0–3), explanation (one sentence) }.
12. misconceptions — OPTIONAL. content: array of { myth, reality }. Common false beliefs in this field. Include if there are sharp myths to bust.
13. sources — REQUIRED. content: array of { label, url, type } where type ∈ "wikipedia", "paper", "book", "article", "database".

INSTRUCTIONS
Generate the JSON post based on the source material I paste below. If the material is incomplete, use what you know about the topic to fill in, but cite carefully.

SOURCE MATERIAL:
[Paste article, paper, data set, or other relevant material here]
```

---

# Format: People

## Feed Card (Pre-Click)

| Element | Description |
|---|---|
| `portrait` | Wikimedia portrait, prominent — for People the face is the visual hook |
| `name` | Name, primary typography |
| `role` | One-word role: "Physicist", "Anti-Apartheid Leader", "Poet", "Activist" |
| `essence` | One sentence distilling the life ("Polish-French physicist who won Nobel Prizes in two sciences, the first woman to ever win one") |
| `teasers` | 3 bullets, ~6 words each — concrete achievements or turning points ("Discovered two elements", "Carried radium in her pocket", "Died from her own discovery") |
| `meta` | `post_reading_time_min` · `post_difficulty (1–3)` · `lifespan` ("1867–1934") · `field` |

**Tone of the card:** The face pulls, the life arc promises a story with substance.

## Detail View Sections

### Part 1 — The Opening (~90 sec read)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 1 | `identity` | **Identity** — one dense sentence: who this person was/is | REQUIRED | `string` |
| 3 | `portrait` | **Portrait** — large Wikimedia image with caption (year, context, source). For People essential, not decorative | REQUIRED | `{image_url, image_caption?, image_attribution?}` |
| 4 | `voices` | **In Their Own Words** — 3–4 quotes by the person themselves, large typography, minimal attribution context ("— 1923, letter to Bohr") | REQUIRED | array of `{quote, attribution}` |
| 5 | `at_a_glance` | **At a Glance** — compact card: birth/death dates · nationality · field(s) · known_for (one line) · movement or era · post_reading_time_min · post_difficulty | REQUIRED | object |

### Part 2 — The Overview (~2 min read)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 6 | `why_they_matter` | **Why They Matter** — paragraph (4–6 sentences) on the central significance. Whoever reads only this gets the essence | REQUIRED | `string` |
| 7 | `life_arc` | **Life Arc** — visual timeline with 5–8 key points. Birth → turning points → death. SVG-based. Gives orientation before the deep dive | REQUIRED | `{visual_svg, milestones: array of {year, label}}` |

### Part 3 — The Core

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 8 | `defining_moments` | **Defining Moments** — 5–10 sections, chronological. Each a key episode: a turning point, a breakthrough, a crisis, an encounter, a major work. Narrative, not analytical | REQUIRED | array of `{title, year_or_period, body (3–6 sentences), image_url?, visual_svg?, location?}` (length 5–10) |
| 9 | `greatest_work` | **Their Greatest Work** — deeper analysis of the one central contribution. For scientists: the theory/discovery. For artists: the masterwork. For activists: the movement/reform. Goes deeper than the chronological mention in defining_moments | OPTIONAL | `{title, body, visual_svg?, image_url?}` |
| 10 | `what_drove_them` | **What Drove Them** — personality, motivation, character traits, relationships, eccentricities. The human behind the achievements | OPTIONAL | `string` |

### Part 4 — What Stays With You

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 11 | `legacy` | **What They Leave Behind** — what changed in the world because of them, what continues today, what we can take from their life. Combines legacy + reflection | REQUIRED | `{body, present_day_impact?, visual_svg?, image_url?}` |

### Part 5 — Test Yourself

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 12 | `quiz` | **Quiz** | REQUIRED | (shared shape) |
| 13 | `related_posts` | **People & Ideas Like This** — 3 internal links: other people, related books, related concepts | OPTIONAL | (shared shape) |

### Part 6 — Context (smaller typography, secondary)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 14 | `their_world` | **The World They Lived In** — era, society, intellectual climate. Important for understanding constraints they faced or movements they responded to (Marie Curie as a woman in 19th century science; Mandela in apartheid SA) | OPTIONAL | `string` |
| 15 | `critique` | **Shadows & Contradictions** — flaws, controversies, problematic stances, blind spots. Intellectual honesty (Jefferson and slavery, Heidegger and Nazism, Gandhi's racism) | OPTIONAL | `string` |
| 16 | `sources` | **Sources & Further Reading** | REQUIRED | (shared shape) |

## Size & Tension

- **Minimal post:** 9 required sections + ~5 defining moments ≈ 14 blocks (~7–9 min)
- **Maximal post:** all 16 + 10 defining moments ≈ 25 blocks (~13–18 min)

```
HOOK (Identity + Portrait + Voices)
  ↓
ORIENTATION (At a Glance → Why They Matter → Life Arc)
  ↓
DEEP DIVE (Defining Moments, 5–10)
  ↓
DEEPER CUTS (Greatest Work + What Drove Them, optional)
  ↓
LEGACY (What They Leave Behind)
  ↓
TEST (Quiz)
  ↓
NEXT HOOK (Related)
  ↓
CONTEXT (Their World → Shadows)
  ↓
ONWARDS (Sources)
```

## AI Generation Prompt — People

Lives on the Post Creation page. User copies this prompt, appends source material (biography, articles, etc.) and runs it in an AI chat.

```
You are writing a Deepscroll long-form post about a person. Deepscroll is an open social media app whose feed replaces doomscrolling with valuable content. Output must be a single JSON object that follows the schema below exactly.

PRINCIPLE
The driver is curiosity, not provocation. For people, the face is the visual hook and the life arc carries the narrative. Substance comes first, deep dive in the middle, mandatory context at the bottom. Each drop-off point in the post should still feel like a complete mini-experience.

STYLE RULES
1. Speak directly: "you", "we", active verbs. No "it has been shown that".
2. Take a stance with clear point of view, not Wikipedia neutrality.
3. Concrete before abstract: example first, then the rule.
4. Show, don't tell — demonstrate, don't claim.
5. Respect hierarchy: best material first, mandatory last.
6. Use lists sparingly; prefer prose when it flows better.
7. No Wikipedia hedging; make clear claims and cite them.
8. Distribute visuals across the post. Portrait is essential. Use Wikimedia Commons or royalty-free historical images. Diagrams as SVG (viewBox "0 0 400 300", currentColor for neutral elements, no shadows or gradients).
9. No buzzword vocabulary ("game-changing", "revolutionary", "mind-blowing" etc.).
10. Honest reading time — match the actual read length, don't undersell.

LANGUAGE
English only.

OUTPUT FORMAT
Return exactly one JSON object:
{
  "feed_card": { ... },
  "sections": [ { "type": "...", "order": N, "content": ... }, ... ]
}

FEED CARD
{
  "portrait_url": string (Wikimedia URL preferred) or null,
  "name": string,
  "role": string (one-word role like "Physicist", "Anti-Apartheid Leader", "Poet"),
  "essence": string (one sentence distilling the life),
  "teasers": [string, string, string] (each ~6 words; concrete achievements or turning points),
  "post_reading_time_min": integer,
  "post_difficulty": 1 | 2 | 3,
  "lifespan": string ("1867–1934" or "1929–present"),
  "field": string
}

SECTIONS
Include every REQUIRED section. For each OPTIONAL section, include it only if it adds real value for this specific person. Use this order:

1. identity — REQUIRED. content: string. One dense sentence: who this person was/is, distilled.
3. portrait — REQUIRED. content: { image_url (Wikimedia URL preferred), image_caption? (year + context, one line), image_attribution? }. The face is the first hook.
4. voices — REQUIRED. content: array of {quote, attribution}, length 3–4. Quotes by the person themselves. Attribution context ~5 words ("— 1923, letter to Bohr", "— Long Walk to Freedom").
5. at_a_glance — REQUIRED. content: { birth_date, death_date or null, nationality, fields (array), known_for (one line), movement_or_era, post_reading_time_min, post_difficulty (1-3) }.
6. why_they_matter — REQUIRED. content: string, 4–6 sentences. The central significance. Whoever reads only this section gets the essence.
7. life_arc — REQUIRED. content: { visual_svg (an SVG timeline), milestones: array of {year, label} (5–8 entries) }. Birth → turning points → death. Gives orientation before defining_moments.
8. defining_moments — REQUIRED. content: array of length 5–10, each item { title (pointed heading), year_or_period (e.g. "1898" or "1948–1952"), body (3–6 sentences, narrative not analytical), image_url? (optional Wikimedia URL), visual_svg? (optional), location? (optional) }. Chronological. Each is a key episode: turning point, breakthrough, crisis, encounter, major work.
9. greatest_work — OPTIONAL. content: { title, body, visual_svg?, image_url? }. Deeper analysis of the one central contribution. Skip if already fully covered in defining_moments.
10. what_drove_them — OPTIONAL. content: string. Personality, motivation, relationships, eccentricities. The human behind the achievements. Skip if you don't have substantial material.
11. legacy — REQUIRED. content: { body, present_day_impact? (optional string), visual_svg?, image_url? }. What changed in the world because of them, what continues today, what we can take from their life.
12. quiz — REQUIRED. content: array of length 5–10, each item { question, options (length 4), answer_index (0–3), explanation (one sentence) }.
13. related_posts — OPTIONAL. content: array of length 3, each item { post_id (leave empty string if not known), title, format, mini_teaser (one sentence) }.
14. their_world — OPTIONAL. content: string. Era, society, intellectual climate. Include when context shapes the person's significance (a woman in 19th century science; an activist under apartheid).
15. critique — OPTIONAL. content: string. Flaws, controversies, problematic stances, blind spots. Intellectual honesty about figures' shadows.
16. sources — REQUIRED. content: array of { label, url, type } where type ∈ "wikipedia", "paper", "book", "article", "database".

INSTRUCTIONS
Generate the JSON post based on the source material I paste below. If the material is incomplete, use what you know about the person to fill in, but cite carefully.

SOURCE MATERIAL:
[Paste biography excerpts, articles, letters, or other relevant material here]
```

---

# Format: Concepts

## Feed Card (Pre-Click)

| Element | Description |
|---|---|
| `field` | Small label above name: "Behavioral Economics", "Statistics", "Philosophy", "Biology"… |
| `concept_name` | Name of the concept, large ("Survivorship Bias", "Compound Interest", "Game Theory") |
| `one_line` | One-line plain-language definition — what it is in everyday words |
| `teaser_visual_svg` | Optional small SVG hinting at the mechanism — often the most compelling pre-click element |
| `teasers` | 3 teaser bullets, max ~6 words each — *what you'll understand* after reading. Not the concept name reworded, but actual sub-insights ("Why hospitals seem dangerous", "The pattern in WWII bombers", "How to spot it daily") |
| `meta` | `post_reading_time_min` · `post_difficulty (1–3)` |

**Tone of the card:** Promise *understanding*, not information. The reader should think "I'd actually use this".

## Detail View Sections

### Part 1 — The Opening (~60 sec read)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 1 | `one_liner` | **The Concept in One Line** — plain-language definition, large typography. No jargon, no hedge | REQUIRED | `string` |
| 3 | `intuition` | **The Intuition** — analogy or thought experiment that lands the core idea *before* any technical explanation ("Imagine you only see the planes that come back…") | REQUIRED | `string` |
| 4 | `visual_explanation` | **See How It Works** — the main SVG diagram showing the concept's mechanism. For Concepts this is constitutive — without it, the concept stays abstract | REQUIRED | `{visual_svg?, image_url?, image_caption?, image_attribution?}` (at least one of visual_svg or image_url required) |

### Part 2 — The Mechanism (~2 min read)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 5 | `how_it_works` | **How It Works** — step-by-step mechanism. 3–6 steps, each a short paragraph or single sentence. The technical explanation, kept concrete | REQUIRED | array of `{step_number, title, body, visual_svg?}` (length 3–6) |
| 6 | `formal_definition` | **The Formal Definition** — for concepts with a precise technical definition (Bayes' Theorem, compound interest, Nash equilibrium). Includes math or formal language. Skip for concepts without one (Survivorship Bias, Hindsight Bias) | OPTIONAL | `{body, formula?: string (KaTeX), notation_legend?: array of {symbol, meaning}}` |

### Part 3 — The Core (~3–6 min read)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 7 | `real_world_examples` | **Where You See It** — 3–6 concrete real-world examples from different domains. Each a short narrative paragraph + optional image. The richer this section, the more transferable the concept | REQUIRED | array of `{title, domain, body, image_url?, visual_svg?}` (length 3–6) |
| 8 | `how_to_apply` | **How to Use It** — practical application. For thinking tools: when to invoke it, what questions to ask. For frameworks: how to apply step by step. Concrete, actionable | REQUIRED | `{body, checklist?: array of string, visual_svg?}` |
| 9 | `where_it_breaks` | **Where It Breaks** — limitations, edge cases, common misapplications. Critical for not turning concepts into hammers that see only nails | REQUIRED | `string` |

### Part 4 — What Stays With You

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 10 | `mental_takeaway` | **What Stays With You** — the one sentence to remember, plus a visual mnemonic if possible. The kernel that sticks after everything else fades | REQUIRED | `{body, visual_svg?}` |

### Part 5 — Test Yourself

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 11 | `quiz` | **Quiz** | REQUIRED | (shared shape) |
| 12 | `related_posts` | **Concepts That Connect** — 3 internal links to related concepts, people who developed them, or books that use them. Critical because concepts live in networks | OPTIONAL | (shared shape) |

### Part 6 — Context (smaller typography, secondary)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 13 | `origin` | **Where It Comes From** — who coined or developed the concept, when, in what discipline. Brief intellectual history. Skip for concepts without clear origin (folk wisdom, ancient ideas) | OPTIONAL | `{body, key_thinkers?: array of {name, role, one_line?, lifespan?, image_url?}, image_url?}` |
| 14 | `nearby_concepts` | **Don't Confuse With** — concepts that sound similar but are distinct. Survivorship Bias vs. Selection Bias, Correlation vs. Causation, Sunk Cost vs. Opportunity Cost | OPTIONAL | array of `{concept, distinction}` |
| 15 | `sources` | **Sources & Further Reading** | REQUIRED | (shared shape) |

## Size & Tension

- **Minimal post:** 8 required sections + ~3 examples ≈ 11 blocks (~5–7 min)
- **Maximal post:** all 15 + 6 examples + 6 mechanism steps ≈ 25 blocks (~12–17 min)

```
HOOK (One Line + Intuition + Visual)
  ↓
MECHANICS (How It Works → Formal Definition)
  ↓
APPLICATION (Real-World Examples → How to Use → Where It Breaks)
  ↓
TAKEAWAY (What Stays With You)
  ↓
TEST (Quiz)
  ↓
NEXT HOOK (Concepts That Connect)
  ↓
CONTEXT (Origin → Don't Confuse With)
  ↓
ONWARDS (Sources)
```

## AI Generation Prompt — Concepts

Lives on the Post Creation page. User copies this prompt, appends source material (textbook excerpt, paper, explainer article, etc.), runs it in an AI chat.

```
You are writing a Deepscroll long-form post about a concept (a thinking tool, framework, or theoretical idea). Deepscroll is an open social media app whose feed replaces doomscrolling with valuable content. Output must be a single JSON object that follows the schema below exactly.

PRINCIPLE
The driver is curiosity, not provocation. For concepts, the goal is understanding the reader can actually apply, not information they passively consume. Substance comes first, deep dive in the middle, mandatory context at the bottom. Each drop-off point in the post should still feel like a complete mini-experience.

STYLE RULES
1. Speak directly: "you", "we", active verbs. No "it has been shown that".
2. Take a stance with clear point of view, not Wikipedia neutrality.
3. Concrete before abstract: example first, then the rule. Especially critical for concepts.
4. Show, don't tell — demonstrate, don't claim.
5. Respect hierarchy: best material first, mandatory last.
6. Use lists sparingly; prefer prose when it flows better.
7. No Wikipedia hedging; make clear claims and cite them.
8. Distribute visuals across the post. For concepts, the main mechanism diagram is constitutive — without it the concept stays abstract. Prefer Wikimedia Commons or royalty-free images. Diagrams as SVG (viewBox "0 0 400 300", currentColor for neutral elements, no shadows or gradients).
9. No buzzword vocabulary ("game-changing", "revolutionary", "mind-blowing" etc.).
10. Honest reading time — match the actual read length, don't undersell.

LANGUAGE
English only.

OUTPUT FORMAT
Return exactly one JSON object:
{
  "feed_card": { ... },
  "sections": [ { "type": "...", "order": N, "content": ... }, ... ]
}

FEED CARD
{
  "field": string ("Behavioral Economics", "Statistics", "Philosophy", etc.),
  "concept_name": string,
  "one_line": string (plain-language definition, everyday words),
  "teaser_visual_svg": string or null (small SVG hinting at the mechanism, or null),
  "teasers": [string, string, string] (each ~6 words; what the reader will understand after reading, not the name reworded),
  "post_reading_time_min": integer,
  "post_difficulty": 1 | 2 | 3
}

SECTIONS
Include every REQUIRED section. For each OPTIONAL section, include it only if it adds real value for this specific concept. Use this order:

1. one_liner — REQUIRED. content: string. Plain-language definition. No jargon, no hedge.
3. intuition — REQUIRED. content: string. An analogy or thought experiment that lands the core idea before any technical explanation. Lowers the cognitive barrier.
4. visual_explanation — REQUIRED. content: { visual_svg?, image_url?, image_caption?, image_attribution? }. At least one of visual_svg or image_url must be present. The main visual showing the concept's mechanism. This is constitutive for concepts — without it, the idea stays abstract.
5. how_it_works — REQUIRED. content: array of length 3–6, each item { step_number, title, body, visual_svg? }. Step-by-step mechanism. Technical but concrete.
6. formal_definition — OPTIONAL. content: { body, formula? (KaTeX string), notation_legend? (array of {symbol, meaning}) }. Include for concepts with a precise technical/mathematical definition (Bayes' Theorem, Nash equilibrium). Skip for concepts without one (Survivorship Bias, Hindsight Bias).
7. real_world_examples — REQUIRED. content: array of length 3–6, each item { title, domain, body, image_url?, visual_svg? }. Concrete examples from different domains. The richer and more varied, the more transferable the concept.
8. how_to_apply — REQUIRED. content: { body, checklist? (array of strings), visual_svg? }. Practical application. For thinking tools: when to invoke it, what questions to ask. For frameworks: how to apply step by step.
9. where_it_breaks — REQUIRED. content: string. Limitations, edge cases, common misapplications. Critical for epistemic hygiene.
10. mental_takeaway — REQUIRED. content: { body, visual_svg? }. The one sentence to remember, plus a visual mnemonic if possible. The kernel that sticks.
11. quiz — REQUIRED. content: array of length 5–10, each item { question, options (length 4), answer_index (0–3), explanation (one sentence) }. Test understanding and application, not memorization.
12. related_posts — OPTIONAL. content: array of length 3, each item { post_id (leave empty string if not known), title, format, mini_teaser (one sentence) }. Especially important for concepts since they live in networks.
13. origin — OPTIONAL. content: { body, key_thinkers? (array of {name, role, one_line?, lifespan?, image_url?}), image_url? }. Who coined or developed the concept, when, in what discipline. Skip for concepts without clear origin.
14. nearby_concepts — OPTIONAL. content: array of { concept, distinction }. Concepts that sound similar but are distinct. Sharpens understanding by contrast.
15. sources — REQUIRED. content: array of { label, url, type } where type ∈ "wikipedia", "paper", "book", "article", "database".

INSTRUCTIONS
Generate the JSON post based on the source material I paste below. If the material is incomplete, use what you know about the concept to fill in, but cite carefully.

SOURCE MATERIAL:
[Paste textbook excerpt, paper, explainer article, or other relevant material here]
```

---

# Format: Questions

## Feed Card (Pre-Click)

| Element | Description |
|---|---|
| `field` | Small label above: "Ethics", "Consciousness", "Free Will", "Identity", "Justice"… |
| `the_question` | The question itself, large typography, set in quotation marks. *This is the hook* — no rephrasing, no clickbait |
| `framing_line` | One sentence framing the stakes: "A trolley is heading for five workers. You can divert it to a track with one." |
| `teasers` | 3 teaser bullets, max ~6 words — perspectives or stakes the reader will encounter ("Utilitarian vs. Kantian answers", "What neuroscience adds", "Why most people freeze") |
| `meta` | `post_reading_time_min` · `post_difficulty (1–3)` |

**Tone of the card:** The question pulls because it's *genuinely hard*. No false promise of an answer. The reader should think "I want to figure out where I stand".

## Detail View Sections

### Part 1 — The Question (~90 sec read)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 1 | `the_question` | **The Question** — stated cleanly, large typography, isolated for impact. No commentary | REQUIRED | `string` |
| 3 | `setup` | **The Setup** — concrete scenario or framing that makes the question vivid. Thought experiments: the scenario. Open questions: what's at stake. 3–5 sentences, scenic writing | REQUIRED | `string` |
| 4 | `why_its_hard` | **Why It's Hard** — what makes this question genuinely difficult? Where does intuition fail, what's the tension between competing values or concepts? A diagnosis, not a teaser | REQUIRED | `string` |

### Part 2 — The Stakes (~1–2 min read)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 5 | `at_a_glance` | **At a Glance** — compact card: field · type (thought experiment / open question / paradox) · first_posed_by + year · still_debated (yes/no) · post_reading_time_min · post_difficulty (1–3) | REQUIRED | object |
| 6 | `what_hangs_on_it` | **What Hangs On It** — paragraph (3–5 sentences) on real-world implications. Why this question matters beyond philosophy seminars. Skip only if the question is purely abstract with no downstream effect | OPTIONAL | `string` |

### Part 3 — The Perspectives (~3–6 min read, the core)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 7 | `perspectives` | **The Perspectives** — 3–5 sections, each presenting one serious position. Each section is written *as if* its position is correct — steelmanned. Includes the philosopher/school behind it, the core argument, and (where useful) a concrete example or visual | REQUIRED | array of `{position_name, school_or_thinker?, body, strongest_argument, concrete_example?, image_url?, visual_svg?}` (length 3–5) |
| 8 | `where_they_clash` | **Where They Clash** — pulls out the deepest disagreements between the perspectives. Not summary — analysis of *why* they can't be reconciled. The intellectual heart of the read | REQUIRED | `string` |
| 9 | `what_science_says` | **What Science Adds** — for questions where empirical research is relevant (free will, consciousness, moral psychology), this section shows what neuroscience / psychology / physics has contributed. Doesn't resolve the question — but constrains it | OPTIONAL | `{body, key_findings?: array of string, visual_svg?, image_url?}` |

### Part 4 — Where You Stand

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 10 | `your_turn` | **Your Turn** — direct invitation to the reader to think. Not just "what do you think?" — specific provocations that force a position. 3–4 sub-prompts, each pushing on a different intuition. Designed as a brief private exercise, not a debate-club question | REQUIRED | `{intro, prompts: array of string (length 3–4), closing_thought?}` |

### Part 5 — Test Yourself

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 11 | `quiz` | **Quiz** — tests understanding of the perspectives, philosophers, key distinctions, and historical context. No "what's the right answer?" questions | REQUIRED | (shared shape) |
| 12 | `related_posts` | **Questions That Connect** — 3 internal links to related questions, philosophers behind them, or relevant concepts | OPTIONAL | (shared shape) |

### Part 6 — Context (smaller typography, secondary)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 13 | `history_of_the_question` | **History of the Question** — how the question evolved over time, key moments in the debate, who shifted the conversation. Important for canonical questions (free will since Augustine, mind-body since Descartes) | OPTIONAL | `string` |
| 14 | `where_the_debate_stands` | **Where the Debate Stands Today** — current state of the discussion in academic philosophy / cognitive science / ethics. What positions are gaining, which are fading. Honest about lack of consensus | OPTIONAL | `string` |
| 15 | `sources` | **Sources & Further Reading** | REQUIRED | (shared shape) |

## Size & Tension

- **Minimal post:** 8 required sections + ~3 perspectives ≈ 11 blocks (~5–7 min)
- **Maximal post:** all 15 + 5 perspectives ≈ 20 blocks (~12–17 min)

```
THE QUESTION (Question + Setup + Why It's Hard)
  ↓
STAKES (At a Glance → What Hangs On It)
  ↓
PERSPECTIVES (3–5 positions → Where They Clash → What Science Adds)
  ↓
REFLECTION (Your Turn — the climax)
  ↓
TEST (Quiz)
  ↓
NEXT HOOK (Questions That Connect)
  ↓
CONTEXT (History → Today's Debate)
  ↓
ONWARDS (Sources)
```

## AI Generation Prompt — Questions

Lives on the Post Creation page. User copies this prompt, appends source material (philosophy texts, thought experiment descriptions, etc.), runs it in an AI chat.

```
You are writing a Deepscroll long-form post about a philosophical question, thought experiment, or open intellectual question. Deepscroll is an open social media app whose feed replaces doomscrolling with valuable content. Output must be a single JSON object that follows the schema below exactly.

PRINCIPLE
The driver is curiosity, not provocation. For questions, the goal is not delivering an answer — it's making the reader think more clearly about a genuinely hard problem. Substance comes first, perspectives in the middle, reflection as the climax, context at the bottom. Each drop-off point should still feel like a complete mini-experience.

STYLE RULES
1. Speak directly: "you", "we", active verbs. No "it has been shown that".
2. Take a stance on the strength of each perspective separately — but never suggest the question itself has a "correct" answer. Steelman every position.
3. Concrete before abstract: scenario first, then the principle.
4. Show, don't tell — demonstrate, don't claim.
5. Respect hierarchy: best material first, mandatory last.
6. Use lists sparingly; prefer prose when it flows better.
7. No Wikipedia hedging on perspectives; each one is presented as if its proponents are right.
8. Distribute visuals across the post. Prefer Wikimedia Commons or royalty-free images. Diagrams as SVG (viewBox "0 0 400 300", currentColor for neutral elements, no shadows or gradients).
9. No buzzword vocabulary ("game-changing", "revolutionary", "mind-blowing" etc.).
10. Honest reading time — match the actual read length, don't undersell.

LANGUAGE
English only.

OUTPUT FORMAT
Return exactly one JSON object:
{
  "feed_card": { ... },
  "sections": [ { "type": "...", "order": N, "content": ... }, ... ]
}

FEED CARD
{
  "field": string ("Ethics", "Consciousness", "Free Will", "Identity", "Justice", etc.),
  "the_question": string (the question itself, in quotation marks),
  "framing_line": string (one sentence framing the stakes or scenario),
  "teasers": [string, string, string] (each ~6 words; perspectives or stakes the reader will encounter),
  "post_reading_time_min": integer,
  "post_difficulty": 1 | 2 | 3
}

SECTIONS
Include every REQUIRED section. For each OPTIONAL section, include it only if it adds real value for this specific question. Use this order:

1. the_question — REQUIRED. content: string. The question stated cleanly, no commentary.
3. setup — REQUIRED. content: string, 3–5 sentences. The concrete scenario or framing that makes the question vivid.
4. why_its_hard — REQUIRED. content: string. A diagnosis of where intuition fails, what tensions exist between competing values or concepts.
5. at_a_glance — REQUIRED. content: { field, type ("thought experiment" | "open question" | "paradox"), first_posed_by, year, still_debated (boolean), post_reading_time_min, post_difficulty (1-3) }.
6. what_hangs_on_it — OPTIONAL. content: string, 3–5 sentences. Real-world implications. Skip if purely abstract.
7. perspectives — REQUIRED. content: array of length 3–5, each item { position_name, school_or_thinker? (e.g. "Utilitarianism / Bentham, Mill"), body (the position explained as if it's correct), strongest_argument (the one-sentence steelman), concrete_example? (optional example), image_url? (Wikimedia portrait of key thinker), visual_svg? }. Each perspective steelmanned.
8. where_they_clash — REQUIRED. content: string. Analysis of why the perspectives can't be reconciled. The intellectual heart.
9. what_science_says — OPTIONAL. content: { body, key_findings? (array of strings), visual_svg?, image_url? }. Include for questions where empirical research constrains the discussion (free will, consciousness, moral psychology). Skip for purely conceptual questions (trolley problem in its classic form).
10. your_turn — REQUIRED. content: { intro, prompts (array of 3–4 strings, each a specific provocation forcing a position), closing_thought? }. Designed as a brief private reflection exercise.
11. quiz — REQUIRED. content: array of length 5–10, each item { question, options (length 4), answer_index (0–3), explanation (one sentence) }. Test understanding of perspectives, philosophers, distinctions, and history — NEVER which position is "correct".
12. related_posts — OPTIONAL. content: array of length 3, each item { post_id (leave empty string if not known), title, format, mini_teaser (one sentence) }.
13. history_of_the_question — OPTIONAL. content: string. How the question evolved over time. Include for canonical questions; skip for new ones.
14. where_the_debate_stands — OPTIONAL. content: string. Current state of the discussion in relevant academic fields. Honest about lack of consensus.
15. sources — REQUIRED. content: array of { label, url, type } where type ∈ "wikipedia", "paper", "book", "article", "database".

INSTRUCTIONS
Generate the JSON post based on the source material I paste below. If the material is incomplete, use what you know about the question and its philosophical history to fill in, but cite carefully. Never suggest the question has a "correct" answer in your output.

SOURCE MATERIAL:
[Paste philosophical text, thought experiment description, paper, or other relevant material here]
```

---

# Format: Stories

## Feed Card (Pre-Click)

| Element | Description |
|---|---|
| `era_label` | Small label above: "1944", "Ancient Rome", "The Cold War", "Last Year"… Sets the temporal frame instantly |
| `headline` | The hook line — sets stakes and atmosphere *without* revealing the twist. Past tense, scenic. "A man bought a wooden box at a flea market in 2007. The contents would unmake a fortune." |
| `lead_image` | Historical photo, Wikimedia or royalty-free. Strong visual presence |
| `teasers` | 3 bullets — *atmosphere and stakes*, not events ("A century of silence", "What three witnesses saw", "The letter that survived") |
| `meta` | `post_reading_time_min` · `post_difficulty (1–3)` · `era` · `category` (true crime, historical mystery, scientific discovery, personal saga, political turning point…) |

**Critical rule:** No teaser may spoil the twist. Aim for "I need to know what happened" — not "I know what happened, let me read the details".

**Tone of the card:** The hook is *promise of story*, not promise of information. The reader should feel "I want to be inside this".

## Detail View Sections

### Part 1 — The Opening (~60 sec read)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 1 | `cold_open` | **The Cold Open** — first sentence/paragraph that drops the reader into the moment. Like a film's opening shot. No exposition, just immersion. 2–4 sentences max | REQUIRED | `string` |
| 3 | `at_a_glance` | **At a Glance** — compact card: era · location · category · sources_reliability (1–3, where 3 = primary documents, 1 = mostly oral/legendary) · post_reading_time_min · post_difficulty (1–3). Crucially: *no plot summary* | REQUIRED | object |

### Part 2 — The Story (the heart, ~5–12 min read)

The narrative itself, broken into **chapters** rather than micro-sections. Each chapter is a substantial narrative block (4–10 sentences), titled scenically.

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 4 | `setting` | **Setting the Scene** — time, place, who matters, what the world was like. Establishes stakes before the action. 1 narrative block + optional period image | REQUIRED | `{body, image_url?, image_caption?}` |
| 5 | `chapters` | **The Story Itself** — 3–7 chapters, each scenically titled (e.g. "The First Letter", "What the Maid Saw", "The Decision"). Each chapter is a real narrative block — written like prose, not bullet points. Optional images interspersed. Pacing matters: chapters can vary in length, building tension toward the turning point | REQUIRED | array of `{title, body (4–10 sentences of narrative prose), image_url?, image_caption?}` (length 3–7) |
| 6 | `the_turn` | **The Turn** — the moment everything changes. The revelation, the twist, the disaster, the breakthrough. For stories without a sharp twist, this is the pivotal phase. Treated as its own beat — short, sharp, given visual emphasis | REQUIRED | `{body, image_url?, image_caption?}` |
| 7 | `the_aftermath` | **The Aftermath** — what happened next. Days, years, sometimes decades. Where the story actually ends | REQUIRED | `{body, image_url?, image_caption?}` |

### Part 3 — Reflection (~2 min read)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 8 | `what_it_means` | **Why History Remembers This** — what makes this story endure? What does it tell us about its time, about people, about institutions? Analytical, not narrative. The reader is now ready to think | REQUIRED | `string` |
| 9 | `what_we_learn` | **What It Teaches** — the broader lesson or pattern. Closest thing Stories has to "What Stays With You". Not heavy-handed moralizing — observation | OPTIONAL | `string` |
| 10 | `unanswered` | **What We Still Don't Know** — gaps in the record, contested details, mysteries that remain. Intellectual honesty about what's known vs. legendary | OPTIONAL | `string` |

### Part 4 — Test Yourself

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 11 | `quiz` | **Quiz** — tests comprehension, key figures, sequence of events, broader context — not trivia | REQUIRED | (shared shape) |
| 12 | `related_posts` | **Stories That Echo This** — 3 internal links: stories with similar themes, the people involved, or the era | OPTIONAL | (shared shape) |

### Part 5 — Context (smaller typography, secondary)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 13 | `cast` | **The Cast** — brief portraits of 2–4 key figures with Wikimedia images, lifespans, one-line description. For complex stories with multiple players | OPTIONAL | array of `{name, role, one_line?, lifespan?, image_url?}` (length 2–4) |
| 14 | `historical_context` | **The Era** — broader historical context: what else was happening, what readers should know about the period to grasp the stakes fully | OPTIONAL | `string` |
| 15 | `sources` | **Sources & Further Reading** | REQUIRED | (shared shape) |

## Size & Tension

- **Minimal post:** 8 required sections + ~3 chapters ≈ 11 blocks (~5–7 min)
- **Maximal post:** all 15 + 7 chapters ≈ 22 blocks (~12–17 min)

```
COLD OPEN (Cold Open + Quiz Badge + At a Glance)
  ↓
THE STORY (Setting → Chapters → Turn → Aftermath)
  ↓
REFLECTION (Why History Remembers → What It Teaches → What We Don't Know)
  ↓
TEST (Quiz)
  ↓
NEXT HOOK (Stories That Echo)
  ↓
CONTEXT (Cast → Era)
  ↓
ONWARDS (Sources)
```

## Spoiler Discipline (Stories-specific)

Stories is the only format where the twist must not appear in early sections. Concretely:
- Feed card teasers describe atmosphere and stakes, never events
- `cold_open` and `setting` build immersion without revealing the turning point
- `at_a_glance` deliberately omits plot summary
- Quiz questions may test the twist (post-read it's fair game)

## AI Generation Prompt — Stories

Lives on the Post Creation page. User copies this prompt, appends source material (historical accounts, interviews, books, documents), runs it in an AI chat.

```
You are writing a Deepscroll long-form post about a story — a historical event, mystery, personal saga, scientific discovery moment, true crime case, or political turning point. Deepscroll is an open social media app whose feed replaces doomscrolling with valuable content. Output must be a single JSON object that follows the schema below exactly.

PRINCIPLE
The driver is curiosity, not provocation. For stories, the narrative itself is the substance — pacing matters more than structure. The story is told first, in scenic prose, and reflection comes after. Spoilers are forbidden in early sections.

STYLE RULES
1. Speak directly: "you", "we" only in reflection sections; the narrative itself is told in third person, past tense, scenic.
2. Take a stance on what the story means in the reflection sections — but tell the story itself with restraint and respect for the facts.
3. Concrete before abstract: scenes before generalizations.
4. Show, don't tell — render moments, don't summarize them.
5. Respect hierarchy: scenic opening first, reflection only after the story is told, context last.
6. Use lists sparingly; the story itself must read as prose, not bullet points.
7. No Wikipedia hedging; make clear claims and cite them. Distinguish what's documented from what's contested.
8. Distribute visuals across the post. Use Wikimedia Commons historical images and period photos. Diagrams as SVG only when genuinely useful (maps, timelines).
9. No buzzword vocabulary ("game-changing", "revolutionary", "mind-blowing" etc.).
10. Honest reading time — match the actual read length, don't undersell.

SPOILER DISCIPLINE (CRITICAL)
This rule overrides all others where they conflict.
- The `headline` in feed_card, the teasers, the `cold_open`, the `setting`, and `at_a_glance` must NOT reveal the turning point or final outcome.
- These early sections build atmosphere, set stakes, and establish characters — they do not pre-tell the story.
- The twist or pivotal moment appears in `the_turn`, not earlier.
- Quiz questions may reference the twist (the reader has read it by then).

LANGUAGE
English only.

OUTPUT FORMAT
Return exactly one JSON object:
{
  "feed_card": { ... },
  "sections": [ { "type": "...", "order": N, "content": ... }, ... ]
}

FEED CARD
{
  "era_label": string ("1944", "Ancient Rome", "Last Year", etc.),
  "headline": string (atmospheric and stakes-setting, NOT spoiler-laden, past tense, scenic),
  "lead_image_url": string (Wikimedia or royalty-free) or null,
  "teasers": [string, string, string] (each ~6 words; atmosphere and stakes, not events),
  "post_reading_time_min": integer,
  "post_difficulty": 1 | 2 | 3,
  "era": string,
  "category": string ("true crime" | "historical mystery" | "scientific discovery" | "personal saga" | "political turning point" | other)
}

SECTIONS
Include every REQUIRED section. For each OPTIONAL section, include it only if it adds real value for this specific story. Use this order:

1. cold_open — REQUIRED. content: string, 2–4 sentences max. Drops the reader into a moment. Like a film's opening shot. No exposition.
3. at_a_glance — REQUIRED. content: { era, location, category, sources_reliability (1–3 where 3 = primary documents, 1 = mostly oral/legendary), post_reading_time_min, post_difficulty (1–3) }. Crucially: NO plot summary fields.
4. setting — REQUIRED. content: { body, image_url?, image_caption? }. Time, place, who matters, what the world was like. Establishes stakes before action. No spoilers.
5. chapters — REQUIRED. content: array of length 3–7, each item { title (scenically titled, not summary-titled), body (4–10 sentences of narrative prose), image_url? (period image), image_caption? }. The actual story, written as prose. Pacing matters — chapters can vary in length, building tension.
6. the_turn — REQUIRED. content: { body, image_url?, image_caption? }. The pivotal moment — revelation, twist, disaster, breakthrough. Short, sharp. For stories with no sharp twist, this is the pivotal phase rather than a single moment.
7. the_aftermath — REQUIRED. content: { body, image_url?, image_caption? }. What happened next. Days, years, sometimes decades.
8. what_it_means — REQUIRED. content: string. Analytical, not narrative. Why history remembers this; what it tells us about the time, people, institutions.
9. what_we_learn — OPTIONAL. content: string. Broader lesson or pattern. Observation, not moralizing. Skip if the story resists a clean lesson.
10. unanswered — OPTIONAL. content: string. Gaps in the record, contested details, mysteries that remain. Include for stories with genuine open questions.
11. quiz — REQUIRED. content: array of length 5–10, each item { question, options (length 4), answer_index (0–3), explanation (one sentence) }. Test comprehension, key figures, sequence, broader context — not trivia.
12. related_posts — OPTIONAL. content: array of length 3, each item { post_id (leave empty string if not known), title, format, mini_teaser (one sentence) }.
13. cast — OPTIONAL. content: array of length 2–4, each item { name, role, one_line?, lifespan?, image_url? }. For stories with multiple key players. Skip for solo stories.
14. historical_context — OPTIONAL. content: string. Broader historical context — what else was happening, what readers should know about the period.
15. sources — REQUIRED. content: array of { label, url, type } where type ∈ "wikipedia", "paper", "book", "article", "database".

INSTRUCTIONS
Generate the JSON post based on the source material I paste below. If the material is incomplete, use what you know about the story to fill in, but cite carefully. Maintain spoiler discipline rigorously — early sections must not reveal the turn or aftermath.

SOURCE MATERIAL:
[Paste historical account, biography excerpt, news article, interview transcript, or other relevant material here]
```

---

# Format: Academy

Academy posts target domain experts and advanced students. The goal is **not** simplification — fachsprache and notation are allowed without translation. Accessibility comes through *structure*, not through dumbing down. A neuroscientist reading a Machine Learning paper should be able to follow; an undergrad in the field should be able to read with effort.

## Feed Card (Pre-Click)

| Element | Description |
|---|---|
| `field` | Field label small above title: "Cognitive Neuroscience", "Machine Learning", "Quantum Optics"… |
| `title` | Paper title (truncated if needed), primary typography |
| `authors_compact` | "Smith et al., 2024" |
| `key_finding_one_line` | The core finding in one technical sentence — the kind of one-liner you'd hear at a conference summary. NOT dumbed down |
| `teasers` | 3 bullets — methodological highlights or key claims ("Pre-registered, n=1,200", "Bayesian model outperforms baseline", "Kahneman 2011 fails to replicate") |
| `meta` | `post_reading_time_min` · `post_difficulty (1–3)` · `published_year` · `venue` (journal/conference acronym) |

**Tone of the card:** "The paper that matters in your field this week." Reader thinks "Have I read this? Should I?"

## Detail View Sections

### Part 1 — The Paper at a Glance (~60 sec read)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 1 | `paper_card` | **Paper Card** — citation block: title, authors with affiliations, venue, year, DOI, arXiv ID, code/data URLs, funding source (optional), conflicts of interest (optional) | REQUIRED | `{title, authors: array of {name, affiliation}, venue, year, doi?, arxiv_id?, code_url?, data_url?, funding_source?, conflicts_of_interest?}` |
| 3 | `tldr` | **TL;DR** — 2–3 sentences with the core finding stated technically. The kind of summary an expert would give a colleague | REQUIRED | `string` |
| 4 | `headline_figure` | **Headline Figure** — the central visual evidence. Either the paper's most important figure (with attribution) or a rebuilt SVG. Caption is technical *and* conceptually accessible | REQUIRED | `{visual_svg?, image_url?, image_caption?, image_attribution?}` (at least one of visual_svg or image_url required) |
| 5 | `at_a_glance` | **At a Glance** — methodological card: study_type · sample_size · pre_registered · open_data · open_code · replication_status · peer_review_status · result_direction · post_reading_time_min · post_difficulty | REQUIRED | object |

### Part 2 — The Research Question

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 6 | `the_question` | **The Question** — what the paper sets out to answer, stated precisely. Connects to ongoing debates in the field | REQUIRED | `string` |
| 7 | `the_big_idea` | **The Big Idea** — the paper's central idea *translated for adjacent fields*. One paragraph, no domain-specific notation, but scientific level intact. Not for laypeople — for an expert from a neighboring discipline | OPTIONAL | `string` |
| 8 | `field_context` | **Where the Field Stood** — prior work, key disagreements, why this question now. Assumes domain knowledge | OPTIONAL | `{body, key_priors?: array of {citation, claim}}` |

### Part 3 — The Method (~2–4 min read)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 9 | `approach` | **The Approach** — methodology at a technical level. Design choices, why this design, what it controls for | REQUIRED | `{body, visual_svg?, image_url?}` |
| 10 | `formalism` | **The Formalism** — equations, models, mathematical setup. KaTeX-rendered. Notation legend included | OPTIONAL | `{body, equations: array of {latex, label?, description}, notation_legend?: array of {symbol, meaning}}` |
| 11 | `data_or_sample` | **Data & Sample** — what data, what subjects, what conditions. Inclusion/exclusion criteria. Power analysis if relevant | OPTIONAL | `string` |

### Part 4 — The Findings (the core)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 12 | `key_findings` | **Key Findings** — 3–7 substantive findings, each as its own block. Each with result stated technically, effect size or significance reported, optional figure. Where possible: `source_in_paper` reference ("Table 2", "Fig. 4b") | REQUIRED | array of `{title, finding, effect_size?, statistical_detail?, source_in_paper?, visual_svg?, image_url?, image_caption?}` (length 3–7) |
| 13 | `figures` | **Headline Figures** — 1–4 of the paper's data figures with technical captions and attribution. Additional to the headline figure in Part 1 | OPTIONAL | array of `{figure_label, image_url, image_caption, image_attribution}` (length 1–4) |
| 14 | `robustness` | **Robustness** — sensitivity analyses, alternative specifications, internal replications. What survives scrutiny | OPTIONAL | `string` |

### Part 5 — Critical Reading

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 15 | `limitations` | **Limitations** — what the *authors themselves* admit cannot be concluded. Methodological, sample, generalizability | REQUIRED | `string` |
| 16 | `objections` | **Objections & Open Questions** — what the *community* raises beyond the authors' admissions: peer review responses, follow-up papers, counterarguments | OPTIONAL | `string` |

### Part 6 — Why It Matters

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 17 | `implications` | **Implications** — what this changes *within the field*. For theory, for practice, for future research directions | REQUIRED | `string` |
| 18 | `connections_to_other_fields` | **Connections to Other Fields** — interdisciplinary bridges. Where this paper opens up to or constrains other disciplines (e.g. Free Energy Principle: neuroscience ↔ ML ↔ physics) | OPTIONAL | `string` |

### Part 7 — Test Yourself

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 19 | `quiz` | **Quiz** — tests comprehension of method, finding, limitations. Domain-appropriate difficulty. Technical terminology allowed and encouraged | REQUIRED | (shared shape) |
| 20 | `related_posts` | **Papers That Connect** — 3 related papers, key concepts, or central figures in the field | OPTIONAL | (shared shape) |

### Part 8 — Context (smaller typography, secondary)

| # | Type | Section | Status | Content shape |
|---|------|---------|--------|---------------|
| 21 | `authors_context` | **The Authors** — brief portraits of lead/corresponding authors, affiliations, prior relevant work. For multi-author papers, lead + senior author usually enough | OPTIONAL | array of `{name, role, one_line?, affiliation?, image_url?}` |
| 22 | `historical_context` | **The Backstory** — for landmark papers: how it came to be written, intellectual or institutional context. For routine papers: skip | OPTIONAL | `string` |
| 23 | `sources` | **Sources & Further Reading** | REQUIRED | (shared shape) |

## Size & Tension

- **Minimal post:** 12 required sections + ~3 findings ≈ 15 blocks (~7–9 min)
- **Maximal post:** all 23 + 7 findings + 4 figures ≈ 32 blocks (~13–18 min)

```
THE PAPER (Paper Card → TL;DR → Headline Figure → At a Glance)
  ↓
THE QUESTION (Question → Big Idea → Field Context)
  ↓
THE METHOD (Approach → Formalism → Data)
  ↓
THE FINDINGS (Key Findings → Figures → Robustness)
  ↓
CRITICAL READING (Limitations → Objections)
  ↓
WHY IT MATTERS (Implications → Connections to Other Fields)
  ↓
TEST (Quiz)
  ↓
NEXT HOOK (Related Papers)
  ↓
CONTEXT (Authors → Backstory)
  ↓
ONWARDS (Sources)
```

## Difficulty Scale (Academy-specific)

The 1–3 scale shifts for Academy:
- **1** = accessible to advanced undergrads or readers from adjacent fields
- **2** = domain expertise required
- **3** = specialist-level reading, deep subfield knowledge

## AI Generation Prompt — Academy

Lives on the Post Creation page. User copies this prompt, appends the paper (PDF, abstract, full text, supplementary materials), runs it in an AI chat.

```
You are writing a Deepscroll long-form post about an academic paper. Deepscroll is an open social media app whose feed replaces doomscrolling with valuable content. Academy posts target domain experts and advanced students. The output must be a single JSON object that follows the schema below exactly.

PRINCIPLE
The driver is curiosity, not provocation. Accessibility for Academy comes through structure, not through dumbing down. Technical fachsprache and notation are allowed without translation. A neuroscientist reading an ML paper should be able to follow; an advanced undergrad in the field should be able to read with effort. Substance comes first, methodology in the middle, critique and implications at the end. Each drop-off point should still feel like a complete mini-experience.

STYLE RULES
1. Speak directly: "you", "we", active verbs. No "it has been shown that".
2. Take a stance — distinguish what's strong from what's weak in the paper. Don't be neutral about quality.
3. Concrete before abstract within sections, but the overall structure is technical from the start.
4. Show, don't tell — let methodology and effect sizes speak.
5. Respect hierarchy: TL;DR + Headline Figure first, methodology and findings middle, context last.
6. Use lists sparingly; prefer prose when it flows better.
7. No Wikipedia hedging; make clear claims and cite them.
8. Distribute visuals across the post. Headline Figure is required — either the paper's most important figure (with source credit) or a rebuilt SVG. Diagrams as SVG (viewBox "0 0 400 300", currentColor for neutral elements, no shadows or gradients).
9. No buzzword vocabulary ("game-changing", "revolutionary", "mind-blowing", "groundbreaking" etc.).
10. Honest reading time — match the actual read length, don't undersell.

CRITICAL RULES FOR ACADEMY
- Technical terminology is allowed and expected in all sections including the Quiz. Do not translate p-values, effect sizes, method names, or notation into layman's terms.
- The "Big Idea" section, if included, is NOT simplification for laypeople. It is a translation for experts from adjacent fields — keep scientific level intact, only drop domain-specific notation.
- Limitations contains only what the authors themselves admit. Objections contains the community's broader critique. Do not conflate them.
- Implications stays within the field. Connections to Other Fields handles cross-disciplinary bridges.
- Result direction must be reported honestly. Null results and negative findings are not "weaker" — often they are more important than positive findings.

LANGUAGE
English only.

OUTPUT FORMAT
Return exactly one JSON object:
{
  "feed_card": { ... },
  "sections": [ { "type": "...", "order": N, "content": ... }, ... ]
}

FEED CARD
{
  "field": string ("Cognitive Neuroscience", "Machine Learning", "Quantum Optics", etc.),
  "title": string (paper title, can be truncated for display),
  "authors_compact": string ("Smith et al., 2024"),
  "key_finding_one_line": string (the core finding in one technical sentence, not dumbed down),
  "teasers": [string, string, string] (methodological highlights or key claims, ~6 words each),
  "post_reading_time_min": integer,
  "post_difficulty": 1 | 2 | 3,
  "published_year": integer,
  "venue": string (journal or conference acronym)
}

SECTIONS
Include every REQUIRED section. For each OPTIONAL section, include it only if it adds real value for this specific paper. Use this order:

1. paper_card — REQUIRED. content: { title, authors: array of {name, affiliation}, venue, year, doi?, arxiv_id?, code_url?, data_url?, funding_source? (string), conflicts_of_interest? (string) }. Full citation block.
3. tldr — REQUIRED. content: string, 2–3 technical sentences. The summary an expert would give a colleague.
4. headline_figure — REQUIRED. content: { visual_svg?, image_url?, image_caption?, image_attribution? }. At least one of visual_svg or image_url must be present. The central visual evidence. Use image_url for the paper's most important figure (with image_attribution for source credit), or visual_svg for a rebuilt version if the original cannot be reproduced. The image_caption is technical AND conceptually accessible.
5. at_a_glance — REQUIRED. content: { study_type ("RCT" | "observational" | "theoretical" | "computational" | "meta-analysis" | "review" | other), sample_size? (where applicable), pre_registered (boolean), open_data (boolean), open_code (boolean), replication_status ("none" | "partial" | "full" | "failed"), peer_review_status ("preprint" | "under_review" | "published"), result_direction ("positive" | "negative" | "null" | "mixed"), post_reading_time_min, post_difficulty (1-3) }.
6. the_question — REQUIRED. content: string. The question the paper sets out to answer, stated precisely. Connects to ongoing debates.
7. the_big_idea — OPTIONAL. content: string, one paragraph. Translation of the paper's central idea for experts from adjacent fields. No domain-specific notation, but scientific level intact. Skip if the paper is so narrowly technical that no adjacent-field translation is meaningful.
8. field_context — OPTIONAL. content: { body, key_priors? (array of {citation, claim}) }. Prior work, key disagreements, why this question now. Assumes domain knowledge.
9. approach — REQUIRED. content: { body, visual_svg?, image_url? }. Methodology at technical level. Design choices, why this design, what it controls for.
10. formalism — OPTIONAL. content: { body, equations (array of {latex, label?, description}), notation_legend? (array of {symbol, meaning}) }. Include for theoretical/mathematical papers. KaTeX-rendered LaTeX strings.
11. data_or_sample — OPTIONAL. content: string. What data, what subjects, what conditions. Inclusion/exclusion criteria. Power analysis if relevant.
12. key_findings — REQUIRED. content: array of length 3–7, each item { title, finding (stated technically), effect_size? (string, e.g. "d = 0.42", "AUC = 0.91"), statistical_detail? (p-values, CIs, etc.), source_in_paper? ("Table 2", "Fig. 4b"), visual_svg?, image_url?, image_caption? }.
13. figures — OPTIONAL. content: array of length 1–4, each item { figure_label, image_url, image_caption, image_attribution }. Additional data figures from the paper with technical captions.
14. robustness — OPTIONAL. content: string. Sensitivity analyses, alternative specifications, internal replications. What survives scrutiny.
15. limitations — REQUIRED. content: string. ONLY what the authors themselves admit cannot be concluded. Stay close to the paper's own discussion.
16. objections — OPTIONAL. content: string. The community's broader critique beyond what authors admit. Peer review responses, follow-up papers, counterarguments. Skip if the paper is too new for community response.
17. implications — REQUIRED. content: string. What this changes within the field. For theory, practice, future research directions.
18. connections_to_other_fields — OPTIONAL. content: string. Interdisciplinary bridges. Where this paper opens up to or constrains other disciplines. Skip if the paper is purely intra-field.
19. quiz — REQUIRED. content: array of length 5–10, each item { question, options (length 4), answer_index (0–3), explanation (one sentence). Technical terminology is allowed and encouraged. Test comprehension of method, finding, and limitations — not trivia.
20. related_posts — OPTIONAL. content: array of length 3, each item { post_id (leave empty string if not known), title, format, mini_teaser (one sentence) }.
21. authors_context — OPTIONAL. content: array of { name, role, one_line?, affiliation?, image_url? } (where role describes their function on the paper, e.g. "Lead author", "Senior author", and one_line gives a brief note on prior work). Lead + senior author usually sufficient. Skip for routine papers.
22. historical_context — OPTIONAL. content: string. Include only for landmark papers — how the paper came to be written, intellectual or institutional context.
23. sources — REQUIRED. content: array of { label, url, type } where type ∈ "wikipedia", "paper", "book", "article", "database".

INSTRUCTIONS
Generate the JSON post based on the source material I paste below. If the material is incomplete, use what you know about the paper, the field, and the methodology to fill in, but cite carefully. Maintain technical accuracy — when in doubt about a methodological detail or effect size, mark it clearly rather than guess.

SOURCE MATERIAL:
[Paste the paper PDF, abstract, full text, supplementary materials, or other relevant material here]
```

---

# Bulk Generation Prompt (Claude Research)

For initial seeding of 10–20 posts via Claude Research, a separate master prompt will be added once all formats are specified. That prompt will generate multiple posts in one pass and is distinct from the per-format Post Creation prompts above.

**Status:** To be added after all 7 formats are complete.

---

# Document Status

| Format | Schema | AI Prompt |
|---|---|---|
| Books | ✅ | ✅ |
| Facts | ✅ | ✅ |
| People | ✅ | ✅ |
| Concepts | ✅ | ✅ |
| Questions | ✅ | ✅ |
| Stories | ✅ | ✅ |
| Academy | ✅ | ✅ |
| Bulk Generation Prompt | ⏳ (after all formats done) | — |
