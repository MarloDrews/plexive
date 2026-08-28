# Content / application split - inventory

Date: 2026-08-28. Uncommitted, by instruction. **Revised the same day** on two points from the
owner: the second-author question is resolvable (section 7), and the thumbnail subsystem was
re-tested from the clients, which **retracted a conclusion in the first pass** (sections 4d, 4e, 4f
and contradiction 2).

**Purpose.** Decide which files could move to a private content repository. This document does not
propose a migration and nothing was moved, deleted or edited to produce it. Every number below comes
from a command run in this session, and the command is shown next to its result.

**Method.** `git ls-files` throughout, so untracked and gitignored files are out of scope by
construction. Dependency claims come from `git grep` over tracked files only. Authorship claims come
from `git blame --line-porcelain`, which counts SURVIVING lines, not commits touched -- the
distinction turns out to matter a great deal in section 7.

---

## 1. Inventory

Sizes from:

```
git ls-files <dir> | while read f; do wc -c < "$f"; done | awk '{s+=$1;c++} END{print c, s/1024}'
```

### 1a. Content material - generation methodology

| Path | Files | Size | What it is |
|---|---|---|---|
| `docs/content-structure/BULK_GENERATION_PROMPTS.md` | 1 | 50.3 KB / 782 L | Bulk generation prompts. The methodology proper. |
| `docs/content-structure/HUMAN_TEXTURE_STANDARD.md` | 1 | 32.5 KB / 472 L | Texture standard v1.9; the band definitions `texture_check.py` implements. |
| `docs/content-structure/STYLE_GUIDE_LONGFORM.md` | 1 | 29.2 KB / 510 L | Prose language rules. |
| `docs/content-structure/CROSS_POST_VARIANCE.md` | 1 | 8.2 KB / 97 L | How a SET of posts reads; keeps a feed from feeling templated. |
| `docs/content-structure/SKELETON_COMMENT_STANDARD.md` | 1 | 19.4 KB / 289 L | How to write the `//` comments inside the skeletons. |
| `docs/content-structure/IMAGE_STANDARD.md` | 1 | 10.1 KB / 192 L | Sourcing standard for photographs and archival images. |
| `docs/content-structure/SVG_STANDARD.md` | 1 | 16.8 KB / 352 L | How a drawn visual looks. Also authoring rules for `glyphs.ts`. |
| `docs/content-structure/LAYOUT_STANDARD.md` | 1 | 12.0 KB / 210 L | Composition of the feed card and detail header. |
| `docs/content-structure/REVIEW_BACKLOG.md` | 1 | 32.2 KB / 307 L | Deferred review items awaiting research. Editorial workflow state. |
| `docs/content-structure/ROADMAP.md` | 1 | 5.7 KB / 91 L | Decided-but-not-built. Memory aid. |
| `docs/content-structure/PLEXIVE_CONTENT_STRUCTURE.md` | 1 | 13.6 KB / 188 L | Schema spec for `sections` / `feed_card`. **Straddles the line - see 4b.** |
| `docs/content-structure/THUMBNAIL_GENERATORS.md` | 1 | 21.4 KB / 158 L | **Generated from application code.** See 4c. |

### 1b. Content material - format definitions

| Path | Files | Size | What it is |
|---|---|---|---|
| `docs/content-structure/skeletons/*.jsonc` | 7 | 244.9 KB | One skeleton per format: academy, books, concepts, facts, people, questions, stories. |
| `docs/content-structure/examples/*_example.json` | 7 | 178.4 KB | The gold examples, one per format. **Runtime + CI dependency - see 3a, 3b.** |

### 1c. Content data

| Path | Files | Size | What it is |
|---|---|---|---|
| `docs/content-structure/generated/facts/*.json` | 49 | ~870 KB | Generated Facts posts. Real content. |
| `docs/content-structure/generated/facts/_recent_moves.md` | 1 | 25.4 KB / 192 L | Rolling tally of rhetorical shapes used, so step 1 can steer away from repeats. |
| `frontend/public/seed-images/` | 5 | 977.0 KB | Portrait JPEGs referenced by `books_example.json`. **Runtime asset - see 3d.** |

Directory total: `docs/content-structure` = 79 files, 1569.9 KB.

### 1d. Content tooling

| Path | Size | What it is |
|---|---|---|
| `tools/texture_check.py` | 61.2 KB / 1258 L | Mechanical layer of HUMAN_TEXTURE_STANDARD. Emits candidates, never verdicts. |
| `tools/pipeline_prompts/facts/step1..step6.txt` | 31.2 KB / 6 files | The six-step Facts generation pipeline prompts. |
| `tools/run_pipeline.sh` / `.ps1` | 19.1 KB | Drivers for the above. |
| `tools/_dump_prose.py` | 2.0 KB / 53 L | Prose extraction helper. |

`tools/` total: 12 files, 125.4 KB. **Two files in `tools/` are NOT content tooling:**
`probe_public_surface.sh` (6.3 KB) and `probe_websocket.py` (6.3 KB) are the closed-beta security
probes from the 2026-08 batch.

**Added 2026-08-28, after the re-test in 4e.** The thumbnail render subsystem also belongs in this
category, which the first pass of this document got wrong:

| Path | Files | Size | What it is |
|---|---|---|---|
| `backend/app/thumbnails/` | 25 | 2712.1 KB | Render engine (17 `.py`, ~5,900 lines; ~2.4 MB is six PNG head/brain assets). Offline: production cannot run it (no matplotlib on the Pi). |
| `backend/app/routers/thumbnails.py` | 1 | -- | Three admin-gated endpoints, **zero client callers**. |
| `backend/scripts/*thumbnail*.py` (6) | 6 | ~34 KB | CLI wrappers over the engine, all run by hand. |
| `backend/tests/thumbnails_test.py` | 1 | 2740 L | Its test suite; the slowest at ~125.6 s. |

### 1e. Content embedded in application code

| Path | Size | What it is |
|---|---|---|
| `backend/app/train_bank.py` | 19.5 KB / 318 L | 100-question Train bank **plus** server-side grading. |
| `frontend/src/lib/train/mockQuestions.ts` | 36.0 KB / 1096 L | The same 100 questions with prompts and options. |
| `frontend/src/lib/glyphs.ts` | 85.5 KB / 341 L | ~139 hand-authored field glyph SVGs. |
| `frontend/src/lib/battle/seededQuestions.ts` | 1.5 KB / 32 L | Seeded shuffle over `mockQuestions`. Logic, not content. |

### 1f. Not content - listed to record that they were examined

`docs/research/` (6 files, 202.1 KB) and `docs/web-review/` (13 files, 534.7 KB) are engineering
reports about the system, not about what to write. `docs/DESIGN.md`, `docs/DESIGN_AUDIT.md`,
`docs/SERVER.md`, `docs/REVIEW.md`, `docs/SECURITY_REVIEW.md` likewise. `frontend/.design-sync/`
(23 files) is component-preview tooling; its previews embed sample prose but it is design tooling,
not the content pipeline, and nothing in the build or test path reads it.

---

## 2. The searches

> **CORRECTION, 2026-08-28. THE SEARCH BELOW HAS A SCOPE HOLE AND ITS "NOTHING FOUND" RESULTS ARE
> NOT TRUSTWORTHY. Read this box before using anything in section 2 or 3c.**
>
> Every search in this section is filtered to `'*.py' '*.ts' '*.tsx' '*.mjs' '*.yml' '*.json'`.
> **That glob cannot see `.md`, `.txt`, `.sh` or `.ps1`** -- which are the only file types that
> reference the content tooling. The `tools/` search below returned three self-referential hits, and
> that emptiness was read as absence.
>
> The unscoped version, `git grep -l "texture_check" -- .`, returns **nine** files, including
> `tools/run_pipeline.sh:37,46` and `tools/run_pipeline.ps1:48,69`, which preflight the checker and
> `exit 1` when it is missing. The correct form of this search takes no `--` pathspec filter at all.
>
> This is the thirteenth instance of the failure shape in CLAUDE.md's `## Rules`, and the variant the
> others do not cover: the other twelve were checkers that passed vacuously, whereas here **no gate
> existed at all**. Removing the files would have left all three required checks green and the Facts
> pipeline dead, because nothing in CI reads `tools/` or `docs/`. Outside `backend/` and `frontend/`
> the search IS the verification, so an unscoped `git grep` is the only trustworthy form of it.

Everything in section 3 rests on one search. Run over tracked files only, because an unscoped
`grep -rn` across `backend frontend mobile-kmp .github tools` did not terminate inside 120 s in this
session -- it descends into `node_modules`. (The `node_modules` problem is real and is why `git grep`
was the right tool; restricting the FILE TYPES was the error, and was never necessary to solve it.)

```
git grep -n "content-structure\|docs/" -- '*.py' '*.ts' '*.tsx' '*.kt' '*.yml' '*.mjs' '*.json' ':!*package-lock.json'
```

Of 25 hits, **19 are comments** (`auth.py:76`, `elo.py:126`, `main.py:83`, `graph_identity.py:5`,
`reading_time.py:10`, `arena.py:192`, `battle.py:89`, `chat.py:362`, `catalog.py:6`,
`layout.tsx:16`, `battle_test.py:112`, `chat_test.py:39`, and others). Those are reference-only by
definition: a comment does not execute.

**Six hits are executable path constructions.** These are the whole finding:

```
backend/download_seed_images.py:15   EXAMPLES_DIR = os.path.join(PROJECT_ROOT, "docs", "content-structure", "examples")
backend/scripts/suggest_thumbnails.py:49  POSTS_DIR = os.path.join(REPO_ROOT, "docs", "content-structure", "generated")
backend/scripts/thumbnail_catalog.py:28   os.path.dirname(BACKEND_DIR), "docs", "content-structure", "THUMBNAIL_GENERATORS.md"
backend/seed.py:317                  examples_dir = os.path.join(project_root, "docs", "content-structure", "examples")
backend/seed.py:340                  generated_dir = os.path.join(project_root, "docs", "content-structure", "generated")
frontend/test/gold-routing-scan.test.mjs:18  const examplesDir = join(here, "..", "..", "docs", "content-structure", "examples")
```

A second search establishes that `tools/` has no consumer anywhere in the app or CI:

```
git grep -n "tools/" -- '*.py' '*.ts' '*.tsx' '*.mjs' '*.yml' '*.json' ':!*package-lock.json'
```

Three hits, all inside `tools/probe_websocket.py` (lines 4, 5, 8) and all self-references in its own
usage docstring. **Nothing outside `tools/` names `tools/`.**

A third establishes that the Kotlin client is uninvolved:

```
git grep -ln "content-structure\|skeleton\|_example.json" -- 'mobile-kmp/*'
```

Zero hits.

---

## 3. Dependency findings

### 3a. `docs/content-structure/examples/` - RUNTIME (seeding) and BUILD TIME (required CI gate)

Two consumers, and the second is the one that would surprise someone.

**Runtime.** `backend/seed.py:314-334`, read this session:

```python
examples_dir = os.path.join(project_root, "docs", "content-structure", "examples")

for filename in sorted(os.listdir(examples_dir)):
```

`os.listdir` on a missing directory raises `FileNotFoundError`. There is no guard. **Moving
`examples/` makes `seed.py` crash outright**, not degrade.

**Build time, and this is the sharp one.** `frontend/test/gold-routing-scan.test.mjs:18-22`:

```js
const examplesDir = join(here, "..", "..", "docs", "content-structure", "examples")

function loadGold(format) {
  return JSON.parse(readFileSync(join(examplesDir, `${format}_example.json`), "utf8"))
}
```

This file runs under `npm test` (`frontend/package.json:10`, `"test": "node --import tsx --test"`),
which is the **`frontend-checks` required status check**. Its `ROUTED` map (lines 68-95) covers four
formats -- books, people, concepts, questions -- and the loop at line 114 emits two tests each, so
**8 of the frontend tests read the gold examples**. `readFileSync` on a missing file throws, so the
whole test file fails, `npm test` exits non-zero, and `frontend-checks` goes red.

Per CLAUDE.md, `frontend-checks` is one of three required checks on `main` and a required check that
fails blocks the pull request. So moving `examples/` out does not merely break seeding -- it makes
the public repository unable to merge anything until the test is changed.

### 3b. `docs/content-structure/generated/` - RUNTIME (seeding), but guarded

`backend/seed.py:336-340`:

```python
generated_dir = os.path.join(project_root, "docs", "content-structure", "generated")

if os.path.isdir(generated_dir):
```

**This one IS guarded.** The asymmetry with Phase 3 is real and load-bearing: moving `generated/`
degrades gracefully -- `seed.py` completes and seeds no generated posts -- while moving `examples/`
crashes it. That asymmetry is not documented anywhere and looks incidental rather than designed.

Second consumer: `backend/scripts/suggest_thumbnails.py:49` walks the same tree. That is a
by-hand script, not part of the app or CI.

### 3c. `tools/` - ~~REFERENCE ONLY~~ WRONG, CORRECTED 2026-08-28

> **This section was wrong twice over, and both errors are recorded rather than deleted.**
>
> **First error: "zero external references".** It rested on the section 2 search, whose glob could
> not see `.md`, `.txt`, `.sh` or `.ps1`. The unscoped search returns nine referencing files.
>
> **Second error, and the one the search could not have found even unscoped: "Moving them breaks
> nothing executable" is false, because `run_pipeline.{sh,ps1}` are not consumers of the tooling --
> they are a PUBLISHING MECHANISM for this repository.** Reading them (which the inventory did not
> do) shows they create `integration/<format>-all` from `main`, cut `bulk/<format>-<batch>` from it,
> `git commit` into `docs/content-structure/generated/`, `git merge --ff-only` back, and under
> `PUSH_TO_MAIN=1` run `git push origin main`; they end by instructing the operator to run
> `python backend/seed.py`. Their preflights at `run_pipeline.sh:46` and `run_pipeline.ps1:69`
> `exit 1` when `texture_check.py` is absent.
>
> Classifying a file by grepping for its name finds consumers. It does not find what a script DOES,
> and "reference only" was a claim about behaviour made without opening the file. The general rule
> this violated is the repository's own: **open the file before describing it.**

**What is actually true**, established 2026-08-28 by reading the files:

| file | what it is | category |
|---|---|---|
| `texture_check.py`, `pipeline_prompts/`, `_dump_prose.py` | methodology | reference only -- **moved private 2026-08-28** |
| `run_pipeline.sh`, `run_pipeline.ps1` | release mechanism for THIS repository | **stays public**; repaired to resolve the moved paths from `PLEXIVE_CONTENT_REPO` |
| `probe_public_surface.sh`, `probe_websocket.py` | closed-beta security probes | stays public, never was content tooling |

The `tools/` directory was never one thing. It held three concerns, and the split runs between
producing content (private) and publishing it (public), not along the directory boundary.

Still true, and worth separating from what was wrong: **no application-runtime and no CI dependency
exists.** Nothing in `backend/app`, `frontend/src`, `mobile-kmp/` or `.github/workflows/` executes
any of it. "Free of CI consequences" held; "free of consequences" did not.

### 3d. `frontend/public/seed-images/` - RUNTIME (served asset)

```
git grep -n "seed-images" -- '*.py' '*.ts' '*.tsx' '*.json' ':!*package-lock.json'
```

`docs/content-structure/examples/books_example.json:256` carries
`"image_url": "/seed-images/Daniel_Kahneman__283283955327_29__28cropped_29.jpg"`. Next.js serves
`frontend/public/` at the site root, so these five JPEGs are fetched by the browser when a seeded
Books post renders. They are content material sitting in an application asset directory, and
`backend/download_seed_images.py:16` is the tool that put them there.

### 3e. `docs/content-structure/THUMBNAIL_GENERATORS.md` - GENERATED FROM APPLICATION CODE

Its own header, read this session:

> Generated from `backend/app/thumbnails/generators.py` by
> `backend/scripts/thumbnail_catalog.py --write-doc`. Do not edit by hand.

Confirmed at `backend/scripts/thumbnail_catalog.py:28`, which writes that exact path, and
`backend/app/thumbnails/catalog.py:217`. **The arrow points from application code into the content
directory.** See 4c.

### 3f. `backend/app/train_bank.py` - RUNTIME APPLICATION CODE, containing content

```
git grep -n "train_bank" -- '*.py'
```

```
backend/app/routers/arena.py:18   from ..train_bank import grade, question_seconds, sequence_ids
backend/app/routers/train.py:15   from ..train_bank import grade
backend/tests/arena_test.py:37    from app.train_bank import TRAIN_QUESTIONS, grade, sequence_ids
backend/tests/smoke_test.py:25    from app.train_bank import TRAIN_QUESTIONS
```

Two live routers import it, and two CI-gated test suites import `TRAIN_QUESTIONS` itself. Its own
docstring (lines 1-18) states it is "a hand-mirrored copy of the frontend pool
(`frontend/src/lib/train/mockQuestions.ts`) -- the same ids, difficulties and answers. Keep the two
in sync". This file cannot move. See 4a.

### 3g. `frontend/src/lib/glyphs.ts` - RUNTIME APPLICATION ASSET, no generator

Rendered via `FieldGlyph.tsx` (2.5 KB). Its header states the authoring rules live in
`SVG_STANDARD.md section 6` and that "A generator never invents a per-post glyph." No tooling in the
tree produces it; the search in section 2 found no generator, and `tools/` contains none. **The
brief's hypothesis that "the tooling that generates them may not be" application code does not
apply here: there is no such tooling.** The glyphs are hand-authored app assets governed by a
content standard. Only the standard is movable.

### Summary

| Candidate | Category | Moving it |
|---|---|---|
| `examples/` | Runtime + **required CI gate** | Breaks `seed.py` hard AND reds `frontend-checks` |
| `generated/` | Runtime, guarded | Seeds nothing; no crash |
| `seed-images/` | Runtime served asset | Broken images on seeded Books post |
| `skeletons/` | Reference only | Nothing |
| Methodology docs (10) | Reference only | Comment pointers in `graph_identity.py:5`, `reading_time.py:10` |
| `THUMBNAIL_GENERATORS.md` | Build-time **output** | Breaks `thumbnail_catalog.py --write-doc` |
| `tools/` (content 10) | Reference only | Nothing |
| `train_bank.py` | Runtime app code | Breaks Train + Arena |
| `mockQuestions.ts` | Runtime app code | Breaks Train + Arena + Battle |
| `glyphs.ts` | Runtime app asset | Feed cards lose glyphs |
| `backend/app/thumbnails/` + router + 6 scripts | **Offline tooling** (revised, 4e/4f) | **No product change.** Reds two `-lt 80` CI floors until they are edited |

---

## 4. Where the line falls

The clean statement: **the line falls between the instructions for making content and the content
that has been made, except that the made content is also the application's fixture data and its
schema is co-owned.**

Cleanly content, movable with only comment pointers to fix: the ten methodology documents, the seven
skeletons, and the ten content tools in `tools/`. That is roughly 480 KB of methodology and tooling
and it is the bulk of what the brief wants private.

Four cases do not divide cleanly, and a fifth turned out to divide much more cleanly than the first
pass of this document claimed. Naming them plainly, as instructed. **4d is a correction to my own
earlier conclusion, and 4e/4f are the re-test that produced it.**

### 4a. The question banks are content and application in one file

`train_bank.py` is 318 lines of which the question bank is the substance and `grade`,
`question_seconds` and `sequence_ids` are the application. Splitting it means splitting a file, not
moving one -- and then the private half becomes a runtime import of the public backend, which
inverts the dependency the split is meant to create. `mockQuestions.ts` has the same shape on the
frontend, and the two are hand-mirrored with no check that they agree. **This is the case where
"content" and "application" are not separable by any file boundary.**

### 4b. The seven format definitions - the seam is not where the brief expects

The brief proposes: `formats.ts` and the `--color-fmt-*` tokens are application, skeletons may not
be. That is right as far as it goes, and it is confirmed --

```
git grep -ln "color-fmt"
```

returns `frontend/src/app/globals.css` (source of truth), `frontend/src/lib/formats.ts` (a
hand-maintained mirror, per its own comment at lines 7-13), `Avatar.tsx`, `VerifiedBadge.tsx`, and
`docs/content-structure/SVG_STANDARD.md`. `formats.ts:15-23` defines `FORMAT_IDS` as the seven
format names and nothing else about them. It never reads a skeleton.

But there is a **third thing** the brief does not name, and it is where the seam actually bites: the
**section-type vocabulary**. `backend/app/models.py:30` stores `sections = Column(JSON,
nullable=False)` -- the backend does not validate section types at all, it stores opaque JSON. The
vocabulary is therefore known in two places that must agree and are never checked against each
other:

- `frontend/src/components/SectionRenderer.tsx` and `frontend/src/types/post.ts`, which render it
- the skeletons and `tools/texture_check.py`, which author and check it

So the seam is: **format identity (7 ids + colors) is application; section-type vocabulary is
shared, mirrored by hand, and unenforced; skeleton prose guidance is content.** Moving the skeletons
puts one half of an already-unchecked contract in a different repository. That does not break
anything today, because nothing checks it today. It makes the existing silent-drift risk harder to
notice.

### 4c. `THUMBNAIL_GENERATORS.md` points the wrong way

It sits in the content directory and would move with it. But it is a build artefact of
`backend/app/thumbnails/generators.py`, written by `backend/scripts/thumbnail_catalog.py`. After a
move, application code in the public repository would write a file in the private one. That is
backwards, and it is the only file in the inventory where the dependency runs from app to content.

### 4d. The thumbnail scripts import the engine -- but the engine is not serving anyone

**This section was wrong in its conclusion on first pass and is corrected here. The import facts
were right; what I inferred from them was not.** The first version said the pipeline "is not content
tooling. It is a 2.7 MB application subsystem served live by `backend/app/routers/thumbnails.py`",
and concluded it could not move. A live router and a used router are different claims, and I
asserted the second having only checked the first. Section 4e establishes, from the clients, that
nothing calls it.

The import facts, which stand. All six scripts under `backend/scripts/` import the engine:

```
grep -n "^from\|^import\|^sys.path" backend/scripts/make_thumbnail.py
```

```
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.thumbnails.nominatim import GeoLookupError
from app.thumbnails.service import (
```

Same shape in `make_concept_thumbnail.py` (`app.thumbnails.concept`), `make_mental_thumbnail.py`
(`app.thumbnails.figures`), `generate_thumbnails.py` (`app.database`, `app.models`,
`app.thumbnail_storage`), `suggest_thumbnails.py` (`app.kiconnect`) and `thumbnail_catalog.py`
(`app.thumbnails.catalog`, `app.thumbnails.generators`).

So moving the scripts *alone* would make the private repository import the public backend. That
remains true. What changes is that moving the scripts alone is not the only option, and it is the
worst of the three. See 4e.

---

### 4e. Nothing calls the thumbnail endpoints, established from the clients

Prompted by `docs/research/repo-hygiene-inventory-2026-08.md:497-505`, which recorded the subsystem
as 35% of the backend with zero client callers. Both that and section 4d can be true at once: a
router that exists and nobody calls. Re-tested here from the client side rather than from the
router.

**The endpoints that exist.** Three, all in `backend/app/routers/thumbnails.py`, registered at
`backend/app/main.py:390` under prefix `/api`:

| endpoint | line | gate |
|---|---|---|
| `POST /api/thumbnails/geography` | 57 | `Depends(require_admin)` (line 60) |
| `POST /api/thumbnails/geography/preview` | 83 | `Depends(require_admin)` (line 86) |
| `GET /api/thumbnails/basemap/status` | 113 | `Depends(require_admin)` (line 114) |

**The client search.** Every client in the tree, case-insensitive, for the word at all:

```
git grep -in "thumbnail" -- 'frontend/src/*' 'mobile-kmp/shared/*' 'mobile-kmp/androidApp/*' 'mobile-kmp/iosApp/*'
```

20 hits, and **not one is a call**. They divide into exactly two groups: `post.thumbnail_url` being
read and rendered (`PostCard.tsx:481-644`, eight `<CardHero src={post.thumbnail_url} />` sites;
`types/post.ts:451-454`), and prose comments about book covers. The single `mobile-kmp` hit,
`NetworkModule.kt:34`, is a comment listing `thumbnail_url` among the fields the JSON decoder must
tolerate.

The explicit negative, on the paths themselves:

```
git grep -in "api/thumbnails\|geography/preview\|basemap/status\|basemap" -- 'frontend/*' 'mobile-kmp/*' ':!*package-lock.json'
```

**Exit code 1. No matches anywhere.** And guarding against a dynamically built URL, `geography`
alone across the clients returns 24 hits, all of them `topic: "geography"` in
`mockQuestions.ts` -- a quiz topic, not a route.

There is no `mobile/` directory any more (`git ls-files mobile` is empty), so the hygiene
inventory's third client no longer exists to check.

**What calls `/api/thumbnails/basemap/status`, since it appeared in the closed-beta probe:**
`tools/probe_public_surface.sh:100` lists it in the path array that the probe sweeps. That is a
by-hand security probe asserting the endpoint is *closed*, not a client using it. Nothing else names
it.

**So: nothing calls any of the three. Plainly stated.**

**How a thumbnail actually reaches a user.** Exactly as you hypothesised. `thumbnail_url` is a plain
database column (`backend/app/models.py:67`, `Column(String, nullable=True)`), exposed in the post
schema (`backend/app/schemas.py:376, 508`) and rendered by `PostCard.tsx`. It is populated offline
by `backend/scripts/generate_thumbnails.py`, whose own docstring (lines 1-6) says:

> Walks the posts that carry a thumbnail spec but no image yet, renders each one
> (app/thumbnails/generators.py), uploads the PNG to Supabase Storage (app/thumbnail_storage.py) and
> writes the public URL onto the post row. **Run manually from backend/ -- never imported or called
> by the app.**

Confirmed in the code at lines 97 and 105-106: `url = upload_thumbnail_png(png, key)` then
`post.thumbnail_url = url; db.commit()`.

**And the strongest evidence is in `requirements.txt` itself**, lines 62-70, which I did not go
looking for:

> matplotlib ... **NOT INSTALLED IN PRODUCTION.** The Pi's venv contains neither matplotlib nor its
> subtree ... The API is unaffected because the import is lazy; the practical consequence is that
> **`generate_thumbnails.py` and the `make_*` CLIs cannot run on the Pi.**

Production is physically incapable of running the generators. The subsystem is offline tooling that
happens to live inside the application package, and the import is an accident of layout rather than
a dependency of the product. Your reading was correct and mine was not.

---

### 4f. What it would take to remove `app/thumbnails/` entirely

The cleaner split, as you put it. The dependency graph turns out to be unusually tidy.

```
git grep -n "thumbnails" -- 'backend/app/*.py' 'backend/app/routers/*.py'
```

- `app/thumbnails/` (the package) is imported by **exactly one file outside itself**:
  `app/routers/thumbnails.py`, lines 17-20.
- `app/routers/thumbnails.py` is imported by **exactly one file**: `app/main.py`, lines 18 and 390.
- `app/thumbnail_storage.py` is a **separate module that does not import `app/thumbnails/` at all**
  -- its only project import is `from .upload_config import SUPABASE_BUCKET, supabase_client`
  (line 11). It is the Supabase upload helper, not part of the render engine.

So the removal is four edits, not a refactor:

1. delete `backend/app/thumbnails/` (25 files, 2712.1 KB, of which ~2.4 MB is six PNG assets)
2. delete `backend/app/routers/thumbnails.py`
3. delete the two references in `backend/app/main.py` (the import at line 18, the `include_router`
   at line 390)
4. delete `backend/tests/thumbnails_test.py` (2740 lines, the single slowest suite at ~125.6 s)

Nothing else in the backend references it. `thumbnail_storage.py` and the `thumbnail_url` column
stay, so **the product is unaffected**: posts keep their stored URLs, `PostCard` keeps rendering
them, and no served response changes. The three endpoints vanish from the OpenAPI document.

**What would break, and it is CI rather than product.** This is the part that is not free, and it is
the repository's own count-floor discipline doing its job:

```
cd backend && find app scripts tests -name '*.py' -not -path '*/__pycache__/*' | wc -l
```

**101 today.** Removing the 17 `.py` files in `app/thumbnails/`, `routers/thumbnails.py`,
`tests/thumbnails_test.py` and the six thumbnail scripts leaves **76**. Two separate gates in
`.github/workflows/backend-checks.yml` assert a floor of 80:

- line 173, the `compileall` guard: `if [ "$count" -lt 80 ]`
- line 233, the ruff guard: `if [ "$count" -lt 80 ]`

**Both would fail.** Per CLAUDE.md, a floor moving down through a deliberate deletion "is worth a
deliberate edit here", so this is expected behaviour, not an obstacle -- but it is two edits that
must happen in the same batch or `backend-checks` reds.

Two floors that would survive, checked so they are not assumed:

- **Suite count.** `git ls-files 'backend/tests/*_test.py' | wc -l` gives **17** today, and the floor
  at line 276 is `-lt 16`. Removing `thumbnails_test.py` leaves exactly 16, which still passes. This
  is closer than it looks -- one more suite deletion would breach it.
- **OpenAPI paths.** The floor is 20 (`MIN_PATHS = 20`, line 212) against 45 observed. Three
  `@router` decorators counted in `routers/thumbnails.py` this session, so removal gives 42.
  Comfortable. (The 45 is documented in CLAUDE.md and `backend-checks.yml`, not measured here --
  booting the app needs a database and that was out of scope.)

**What removal would buy in dependencies.** Measured by extracting every import in the package:

```
cat backend/app/thumbnails/*.py | grep -E "^\s*(import|from) " | sed -E 's/^\s+//' | awk '{print $2}' | cut -d. -f1 | sort -u
```

Third-party: `matplotlib`, `PIL`, `requests`. Cross-checked for other users elsewhere in the
backend:

| package | used outside `app/thumbnails/`? | verdict |
|---|---|---|
| `matplotlib` | **no** | droppable |
| `numpy` | **no** | droppable |
| `PIL` (Pillow) | **yes** -- `app/sanitize.py:6`, `from PIL import Image, ImageOps` | **must stay** |
| `requests` | **yes** -- `app/kiconnect.py`, `app/routers/auth.py` | **must stay** |

So Pillow stays regardless: `sanitize.py` uses it for the SEC-023 pixel cap and EXIF handling on
user uploads, which is security code. What leaves is `matplotlib==3.11.1` plus the subtree
`requirements.txt` names explicitly at lines 80-82 -- contourpy, cycler, fonttools, kiwisolver,
numpy, pyparsing, python-dateutil -- i.e. **8 of the 69 pinned packages**, none of which production
installs today anyway.

Note the pin-count floor: `backend-checks` asserts a floor of 70 parsed pins across
`requirements.txt` + `requirements-dev.txt`. `requirements.txt` alone holds 69
(`grep -cE "^[a-zA-Z]" backend/requirements.txt`), so with the dev file the combined figure has
headroom for 8 removals -- but it is close enough that it must be recounted, not assumed, at the
time.

**Net effect of the full removal:** 2.7 MB and ~5,900 lines out of the public backend (the hygiene
inventory's 35% figure), 8 pins dropped, the slowest test suite gone (backend suite wall clock falls
from 242.6 s to ~117 s, per that inventory's own measurement), and the private repository gets a
self-contained render engine that imports nothing from the public one except
`thumbnail_storage.py`'s ~40 lines and `upload_config` -- which it would be cheaper to copy than to
depend on.

**The awkward option is therefore avoidable.** You said you would take it if something called the
endpoints. Nothing does, so it does not arise.

---

## 5. Could someone fork the public repository today and run a working Plexive?

**Today: yes, with one caveat that is not about content.**

From `backend/.env.example`, read this session, the required variables are `JWT_SECRET` and
`DATABASE_URL`. Schema creation is automatic -- `backend/app/main.py:110-113` calls
`Base.metadata.create_all(bind=engine)` at boot (with the concurrent-boot race tolerated, per
M146/ARCH-014), so a fresh database gets its tables without running the `backend/scripts/add_*.py`
migrations. `backend/requirements.txt` pins all 69 packages. The frontend needs
`NEXT_PUBLIC_API_URL` and nothing else; `BETA_USER`/`BETA_PASSWORD` are only enforced under
`NODE_ENV=production`.

A fork then runs `seed.py`, which reads `docs/content-structure/examples/` and
`docs/content-structure/generated/` and produces **7 example posts plus 49 generated Facts posts**
under the `@Marlo` account. That is a populated, working feed.

The caveat: `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` are needed for thumbnail *storage*, and Google
sign-in needs a client id. Neither blocks booting or serving; `.env.example` documents the Google
path as returning 503 and hiding the button when unset. Nothing else is gated on a secret the fork
cannot obtain.

**After the proposed split: it depends entirely on `examples/`, and the answer flips on that one
directory.**

- If `examples/` and `generated/` both move out: `seed.py` raises `FileNotFoundError` at line 318
  before seeding anything. A fork boots and serves an **empty feed**, and cannot populate one,
  because the seeder is the only bulk ingest path in the tree. `frontend-checks` also reds, so the
  fork inherits a repository whose own required CI does not pass.
- If only `generated/` moves and `examples/` stays: `seed.py` completes (Phase 4 is guarded at line
  339), a fork gets **7 posts**, one per format, and CI stays green.

So the honest answer to the labelling question: **the application stays genuinely open source in
either case -- every line needed to boot and serve remains, and the create-a-post UI exists
(`frontend/src/app/create/`) -- but if `examples/` leaves, what a fork can actually run is a
functioning empty app rather than a functioning Plexive.** Whether that reads as "open source" or
"source-available" is a judgement about seed data, not about code, and it is decidable: keeping the
seven `examples/` public keeps the fork story intact at a cost of 178 KB. That is the cheapest
single decision in this document.

---

## 6. What is already public

The repository is `https://github.com/MarloDrews/plexive.git`, AGPL-3.0 (`LICENSE`, line 1). Per
CLAUDE.md's Repository Security Settings, it is public.

```
git log --reverse --format='%h %ad %an %s' --date=short -- docs/content-structure | head -3
git log --oneline -- docs/content-structure | wc -l
```

- First content commit: **`ba460dd`, 2026-06-08**, "feat(content): replace per-format fields with
  sections and feed_card model".
- **319 commits** have touched `docs/content-structure` since.
- `tools/` begins **`8cc46ff`, 2026-06-27**, "docs(content-structure): add human texture standard and
  texture check tool".
- Repository itself begins `dc62bbe`, 2026-05-30.

**So roughly three months of content methodology is already published**, and a fork taken today
contains every file in section 1 at its current state, plus every intermediate version in history.
That includes all seven skeletons, all seven gold examples, all 49 generated Facts posts,
BULK_GENERATION_PROMPTS.md at 782 lines, HUMAN_TEXTURE_STANDARD.md at 472 lines, the calibration
history of that standard from v1.7 through v1.9, and `texture_check.py` at 1258 lines.

This confirms the brief's own framing and is worth restating in the sharpest form: **moving these
files forward from today removes nothing from anyone who has already cloned, and removes nothing
from GitHub's history.** The only thing a move buys is that the NEXT version of the methodology is
unpublished. Given that the standards are versioned and still moving -- `_recent_moves.md` is a
rolling tally, REVIEW_BACKLOG.md is live workflow state -- that is a real benefit. It is not
recovery.

---

## 7. Contribution check

**Yes. There is a second author on content material, and the concentration is much higher than
elsewhere in the tree.** This is not the Kotlin starter template case the brief anticipated -- that
is Jan Tennert, 7 commits, confined to `mobile-kmp/`.

```
git log --format='%an <%ae>' | sort | uniq -c | sort -rn
```

```
   1003 MarloDrews <marlo07drews@gmail.com>
     65 silasmk <silasmck@t-online.de>
     41 Marlo Drews <marlo07drews@gmail.com>
     19 Silas Mack <160138563+silas-mack@users.noreply.github.com>
      8 dependabot[bot]
      7 Jan Tennert <jan.m.tennert@gmail.com>
```

Commit counts over-attribute, because `git log --name-only` folds in merge commits and the
mechanical `298b2715 chore: rename Deepscroll to Plexive`. **Surviving lines are the right measure**
for a licence question, so everything below is `git blame --line-porcelain <file> | grep '^author ' |
sort | uniq -c`.

### Methodology documents - second-author footprint is trivial

| File | MarloDrews | silasmk |
|---|---|---|
| `BULK_GENERATION_PROMPTS.md` | 781 | **1** |
| `STYLE_GUIDE_LONGFORM.md` | 509 | **1** |
| `HUMAN_TEXTURE_STANDARD.md` | 472 | **0** |
| `SVG_STANDARD.md` | 350 | **2** |
| `tools/texture_check.py` | 1258 | **0** |
| `tools/pipeline_prompts/facts/step3.txt` | 64 | **1** |
| `PLEXIVE_CONTENT_STRUCTURE.md` | 158 | **30** |

The 1-2 line hits are the Plexive rename. **The core methodology is effectively single-author.**

### Skeletons - one substantial exception

| File | MarloDrews | silasmk |
|---|---|---|
| `facts_skeleton.jsonc` | 426 | 2 |
| `academy_skeleton.jsonc` | 646 | **142** |

### Gold examples - four of seven are MAJORITY second-author

```
for f in $(git ls-files docs/content-structure/examples); do git blame --line-porcelain "$f" | grep '^author ' | sort | uniq -c; done
```

| File | MarloDrews | silasmk |
|---|---|---|
| `books_example.json` | 303 | 0 |
| `facts_example.json` | 293 | 0 |
| `people_example.json` | 339 | 0 |
| `academy_example.json` | 78 | **303** |
| `concepts_example.json` | 105 | **204** |
| `questions_example.json` | 109 | **185** |
| `stories_example.json` | 93 | **175** |

### Generated Facts - aggregate

```
git ls-files docs/content-structure/generated | while read f; do git blame --line-porcelain "$f"; done | grep '^author ' | sort | uniq -c
```

MarloDrews 12299, silasmk 161. Effectively single-author.

### Question banks - wholly second-author

| File | MarloDrews | silasmk |
|---|---|---|
| `frontend/src/lib/train/mockQuestions.ts` | **0** | **1096** |
| `backend/app/train_bank.py` | 27 | **291** |
| `frontend/src/lib/battle/seededQuestions.ts` | 5 | 27 |

For completeness: `glyphs.ts` 341/0 Marlo, `formats.ts` 150/1, `seed.py` 351/13,
`backend/app/thumbnails/` shows 9 silasmk commits (the thumbnail system was largely their work).

**Status, updated 2026-08-28 on the owner's instruction.** The second author is Silas, he has already
agreed to a second repository, and that agreement is being put in writing. **The copyright question
is therefore resolvable rather than blocking, and it is recorded here as a dependency with a known
resolution, not as a risk.**

What remains worth keeping in view is only the mechanical part: the concentrations are the four gold
examples, `academy_skeleton.jsonc`, and the two question banks, so those are the files the written
agreement should be understood to cover. Note also the collision with section 3a, which is a
scheduling fact rather than a legal one: **two of the four majority-second-author examples (concepts
and questions) are exactly the files the `frontend-checks` gate reads.** `academy` and `stories` are
not in the `ROUTED` map.

---

## 8. What contradicts what you told me

Per the repository's execution-discipline skill, this section is mandatory and includes the parts
stated as fact in the brief.

1. **"`tools/`" is not uniformly content tooling.** `probe_public_surface.sh` and
   `probe_websocket.py` are closed-beta security probes belonging to the application. 2 of 12 files.

2. **RETRACTED, 2026-08-28. "The thumbnail pipeline is not movable" was my error, not a divergence
   in the brief.** I checked that a router exists and asserted that it serves the product, which is
   a different claim I had not tested. Re-tested from the clients (4e): zero callers in
   `frontend/src`, `mobile-kmp/` or anywhere else; all three endpoints are `require_admin`;
   thumbnails reach users as a stored `thumbnail_url` column written offline; and
   `requirements.txt:62-70` records that production cannot even run the generators because the Pi
   has no matplotlib. The import in 4d was real and the inference from it was wrong. The full
   removal is four deletions and two CI floor edits (4f).

   The general lesson, since it is the second time this shape has appeared in this repository's
   notes: **a router that exists and a router that is used are different facts, and the first is
   much easier to check than the second.** `repo-hygiene-inventory-2026-08.md:497-505` had already
   recorded the correct answer and I did not consult it before concluding.

3. **"The glyph library ... the tooling that generates them may not be" -- there is no such
   tooling.** `glyphs.ts` is hand-authored per `SVG_STANDARD.md section 6`, and its own header says
   "A generator never invents a per-post glyph." Only the standard is movable.

4. **`train_bank.py` is the obvious suspect -- and it is worse than the brief suggests.** The brief
   frames it as application code containing content. It is also **91% second-authored** (291/318),
   and its frontend mirror `mockQuestions.ts` is **100% second-authored** (1096/1096). The
   authorship question and the content/application question land on the same file.

5. **The brief did not anticipate a CI dependency, and there is one.** `examples/` is read by
   `frontend/test/gold-routing-scan.test.mjs`, which runs in the **required** `frontend-checks`
   gate. The brief's three categories (runtime, build time, reference only) cover it, but "build
   time" understates it: this is a required status check on a protected branch, so the consequence
   is that `main` cannot accept merges, not that a build is inconvenienced.

6. **The second author is not confined to the Kotlin template.** The brief expected the known second
   author to be the Kotlin starter (correctly -- that is Jan Tennert in `mobile-kmp/`). silasmk has
   65+19 commits and majority authorship of four gold examples and both question banks. **Resolved
   2026-08-28: this is Silas, he has agreed to the second repository, and written confirmation is
   being obtained. It is a dependency, not a blocker.**

7. **A rule collision I did not resolve, by instruction.** CLAUDE.md requires that ARCHITECTURE.md be
   updated after every change, and that documentation made false by a change be corrected in the
   same batch. This session created a file. Your brief says no file is moved, deleted or edited and
   nothing is committed. I left ARCHITECTURE.md untouched, treating your instruction as governing.
   Flagging it rather than deciding it.

8. **One thing I could not verify and did not attempt.** Whether `seed.py` actually crashes on a
   missing `examples/` is read from the source (`os.listdir` at line 318, unguarded) rather than
   demonstrated, because running it needs a database and the brief forbids database operations. The
   guarded/unguarded asymmetry between lines 318 and 339 is visible in the source either way.

---

## 8b. Batch B pre-flight, measured 2026-08-28

Added after the owner split the work into Batch A (methodology: `BULK_GENERATION_PROMPTS.md`,
`HUMAN_TEXTURE_STANDARD.md`, `texture_check.py` -- no consumers, no CI change) and Batch B (the
thumbnail subsystem, which turns two required gates red on purpose). Keeping them apart is so a red
check attributes to one batch. Nothing here is built; these are the numbers Batch B needs.

**Method: dry-run removal in a scratch copy, not subtraction.** Every tracked file under `backend/`
was copied to a scratch directory, the Batch B files deleted there, and the workflow's own commands
re-run. The scratch copy reproduced the live counts exactly before removal (find 101, ruff 103),
which is what makes the after-numbers trustworthy.

### 1. The exact file-count floor change

**Correction first: the figures are 101 -> 76, not 100 -> 68.** The "100" is the value the workflow
comment records from when it was written; the tree has since grown by one. Verified that a fresh CI
checkout sees the same number as this working tree -- `git ls-files` and `find` both give 101, and
there are no untracked `.py` files under `app/ scripts/ tests/`.

**The two floors count different things**, which subtraction would have missed:

| gate | line | command | before | after (B1) | after (B2) | floor |
|---|---|---|---:|---:|---:|---:|
| Syntax check | `backend-checks.yml:171-173` | `find app scripts tests -name '*.py' -not -path '*/__pycache__/*'` | 101 | **76** | **75** | 80 |
| Ruff | `backend-checks.yml:230-232` | `ruff check --select F --show-files .` | 103 | **78** | **77** | 80 |

The ruff step runs over `.` from `backend/`, so it also counts `seed.py` and `download_seed_images.py`
-- consistently +2 over the find count. Measured with the pinned `ruff 0.16.4`, which is installed
locally at `backend/.venv/Scripts/ruff.exe`.

**Both floors fail, and the ruff one fails by only 2.** That margin is worth knowing: anyone
sanity-checking with the find number alone would set a floor that still reds the ruff step.

B1 = subsystem removed, `thumbnail_storage.py` stays. B2 = it moves too (see item 4; B2 is the
recommended shape).

A floor consistent with the existing convention -- the current 80 sits at 80% of the 100 observed
when written -- would be **60** for both under B2 (75 and 77 observed). That is a proposal, not a
measurement.

**The removal is clean.** After deleting the files *and* the two `main.py` lines (the import at
line 18 and the `include_router` at line 390), in the scratch copy:

- `ruff check --select F .` -> `All checks passed!` (no orphaned imports anywhere)
- `python -m compileall -q app scripts tests seed.py` -> clean

Two files match `*thumbnail*` and are deliberately **kept**: `app/thumbnail_storage.py` (item 4) and
`scripts/add_thumbnail_columns.py`, the one-time DDL that created the `thumbnail_url` column. The
column stays, so its migration stays.

### 2. The suite floor: exactly met, with zero margin

Run with the workflow's own glob (`backend-checks.yml:272`, `files=$(ls tests/*_test.py | sort)`),
in the scratch copy after removal: **exactly 16**. The floor at line 276 is `-lt 16`, so 16 passes.

**"Exactly met" is the right description, not "exceeded".** It is a floor with no margin: the next
suite deleted for any reason reds the gate. Note also that `_throwaway_db.py` and `perf_probe.py` do
not match `*_test.py` and never counted.

Whether to lower it to keep headroom is a judgement -- but per CLAUDE.md, the floors sitting at
their observed value are the ones that "only move down through a deliberate deletion", so leaving it
at 16 is consistent with the existing design and simply means the next deletion is also deliberate.

### 3. What else counts the three OpenAPI paths

45 -> 42. **Nothing that asserts breaks; five things that describe go stale.**

Two real assertions, both floors of 20, both comfortably safe at 42:

- `.github/workflows/backend-checks.yml:212-217`, `MIN_PATHS = 20`
- `backend/tests/closed_beta_test.py:127-128`, `len(app.openapi()["paths"]) >= 20` -- worth naming
  because it is a *test*, not the workflow, and would not have been found by reading the workflow
  alone

Five prose surfaces that would become false, and which CLAUDE.md's own rule requires be corrected in
the same batch:

| file | line | claim |
|---|---|---|
| `backend/app/main.py` | 148 | "verified, 45 paths either way" |
| `.github/workflows/backend-checks.yml` | 212-213 | "45 observed under both 0.136.3 and 0.141.1" |
| `ARCHITECTURE.md` | 39 | "asserts a floor of 20 OpenAPI paths; 45 observed" |
| `ARCHITECTURE.md` | 94 | "app.openapi() ... still returns all 45 paths" |
| `docs/research/repo-hygiene-inventory-2026-08.md` | 393, 768 | "45 paths, 50 REST operations, 54 component schemas" |

The hygiene inventory's "50 REST operations" also drops to 47 (three endpoints, one method each).

One more, not a count but a stale probe: `tools/probe_public_surface.sh:100` sweeps
`/api/thumbnails/basemap/status`. Checked its logic at lines 48-62 -- it flags `LEAK` only on a 200,
so a 404 prints unflagged and there is **no false alarm and no false reassurance**. But the line
would then probe a route that cannot exist while still incrementing the script's `checked` total,
which is precisely the "a checker that reports its own failure" shape this repository tracks. Remove
the line in Batch B.

### 4. What happens to `thumbnail_storage.py`

**It should move, not stay and not be copied to both.** The measurement that decides it:

```
git grep -n "thumbnail_storage" -- '*.py'
```

Its only importers are `backend/scripts/generate_thumbnails.py:40` and
`backend/tests/thumbnails_test.py:1478-1533`. **Both are inside Batch B.** So the moment Batch B
lands, `thumbnail_storage.py` has *zero* importers in the public repository -- it becomes a dead
module, and `repo-hygiene-inventory-2026-08.md:488` currently records as a property that "the
backend has **no** dead modules: every `app/*.py` ... file has at least one importer". Leaving it
would break that property on the same day.

It is also already built for the move. Its own docstring says it is "Kept separate from that router
because thumbnails are written by scripts, not by an HTTP request, and must not depend on FastAPI or
on a current_user." It is 51 lines and imports exactly one project module:
`from .upload_config import SUPABASE_BUCKET, supabase_client` (line 11).

`upload_config.py` must **stay public** -- `routers/auth.py:22`, `routers/uploads.py:10` and
`sanitize.py:8` all use it. So the private repository should **copy the ~12 lines it needs** (the
bucket name and the `create_client` construction) rather than import `upload_config`, which keeps
the split one-directional. Copying `thumbnail_storage.py` to both would mean two divergent copies of
a path-hashing function whose whole job is producing stable, content-addressed URLs -- the one kind
of duplication worth avoiding here.

Moving it is variant **B2** in the table above: find 75, ruff 77.

---

## 9. Decisions that would have to be made before anything moves

1. **`examples/` -- public or private?** This single directory decides the fork answer (section 5),
   whether `frontend-checks` keeps passing (3a), and whether `seed.py` runs at all. 178 KB. It is
   the first decision and most others depend on it.

2. **If `examples/` goes private: what replaces it in CI?** Either
   `frontend/test/gold-routing-scan.test.mjs` loses its 8 gold tests, or the four routed examples
   are duplicated into `frontend/test/fixtures/`. Note the second option republishes the same
   content under a different path, which achieves nothing for the privacy goal.

3. **If `examples/` goes private: is a fork's empty feed acceptable?** And does anything replace
   `seed.py` as a bulk ingest path for a fork?

4. **`generated/` -- private?** Cheaper than `examples/`: guarded in `seed.py`, no CI dependency.
   The 49 Facts posts and 870 KB are already published, so this is about future posts only.

5. **The question banks.** Three options, none clean: leave `train_bank.py` and `mockQuestions.ts`
   public as-is; split each file into bank plus logic and accept a private-to-public runtime
   dependency; or move the bank to a database table and delete both files. This is the only case
   where the file boundary genuinely cannot carry the split (4a).

6. **The thumbnail subsystem -- move it out whole, or leave it whole?** Revised 2026-08-28. This is
   now a genuine option rather than a blocked one, and it is the largest single item on the table:
   2.7 MB, ~5,900 lines, 35% of the backend, 8 pins, and the slowest test suite. The three sub-options,
   worst to best:
   - *Move the scripts only.* The private repository imports the public backend. Do not do this;
     it is the awkward option and 4e removes the reason to accept it.
   - *Leave everything public.* Costs nothing, changes nothing, keeps a third of the public backend
     as code nobody calls.
   - *Move `app/thumbnails/` + `routers/thumbnails.py` + the 6 scripts + `thumbnails_test.py` out
     whole.* Four deletions, two CI floor edits (80 -> a new floor, in two places), 8 pins dropped,
     no product change. The private repository would copy `thumbnail_storage.py` rather than import
     it.

   The decision needed is which of the three, and it is independent of every content decision above.

7. **If the subsystem moves: what is the new Python file-count floor?** It must be set deliberately
   in both `backend-checks.yml:173` and `:233`, in the same batch as the deletion, or the gate reds.
   And the suite floor at `:276` goes from 17 actual against a floor of 16 to exactly 16 -- decide
   whether to lower it to keep headroom.

8. **`THUMBNAIL_GENERATORS.md`.** Either it stops living under `content-structure/`, or
   `thumbnail_catalog.py --write-doc` writes across a repository boundary (4c). **If the subsystem
   moves out whole, this resolves itself** -- generator, script and document all end up in the same
   private repository, and the arrow no longer crosses a boundary. That is a further argument for
   the third sub-option above.

9. **The section-type vocabulary.** Today it is mirrored by hand between `SectionRenderer.tsx` and
   the skeletons with nothing checking agreement (4b). Moving the skeletons does not create the
   drift risk but does make it harder to see. Decide whether a check is wanted before the split, not
   after.

10. **~~Second-author consent.~~ RESOLVED 2026-08-28.** Silas has agreed to the second repository and
    written confirmation is being obtained. The files the agreement should be understood to cover
    are the four gold examples (academy, concepts, questions, stories), `academy_skeleton.jsonc`,
    and the two question banks (`mockQuestions.ts`, `train_bank.py`). Kept in the list as a
    dependency to close, not a decision to make.

11. **`seed-images/`.** Five JPEGs, 977 KB, referenced by `books_example.json` and served from
    `frontend/public/`. They follow `examples/` logically but cannot follow it physically without
    breaking the image URLs.

12. **`probe_public_surface.sh` and `probe_websocket.py`.** Confirm they stay public with the
    application rather than travelling with `tools/`.
