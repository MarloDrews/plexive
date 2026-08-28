# Content structure

The schema and standards for Plexive posts: what a post is made of and how it is
presented. Start at `PLEXIVE_CONTENT_STRUCTURE.md`.

## Where the generation methodology went

**How posts are written is no longer public.** As of 2026-08-28 the generation
methodology lives in a separate private repository, and this repository keeps
only the schema, the standards for presentation, and the content itself.

Moved out:

| was | what it was |
|---|---|
| `docs/content-structure/BULK_GENERATION_PROMPTS.md` | the bulk generation prompts |
| `docs/content-structure/HUMAN_TEXTURE_STANDARD.md` | how prose must read as human |
| `tools/texture_check.py` | the mechanical checker for that standard |
| `tools/pipeline_prompts/` | the six-step Facts pipeline prompts |
| `tools/_dump_prose.py` | prose extractor for the human-sound review |

And on 2026-08-28, in a second batch, the thumbnail render subsystem:

| was | what it was |
|---|---|
| `backend/app/thumbnails/` | the render engine (17 modules plus the head/brain artwork) |
| `backend/app/routers/thumbnails.py` | three admin-only render endpoints, which no client ever called |
| `backend/app/thumbnail_storage.py` | the Supabase uploader for generated PNGs |
| `backend/app/kiconnect.py` | the AI client the spec-suggester used |
| `backend/scripts/make_*.py`, `generate_thumbnails.py`, `suggest_thumbnails.py`, `thumbnail_catalog.py` | the six by-hand CLIs over the engine |
| `backend/tests/thumbnails_test.py` | its test suite |
| `docs/content-structure/THUMBNAIL_GENERATORS.md` | the generator catalogue, itself generated from the engine |

**The product did not change.** `posts.thumbnail_url` and `posts.thumbnail_spec` stay, `seed.py` still stores specs, and `PostCard` still renders whatever URL a post carries. Production could never run the generators anyway -- the Pi's venv has no matplotlib -- so what left was offline tooling that happened to live inside the application package. Eight pinned dependencies left with it.

The renderer writes `posts.thumbnail_url` over a direct database connection rather than by importing this backend, so the split runs one way only. The four column names it depends on are recorded in `backend/app/models.py`, because nothing here can test them.

No URL is given here on purpose: the repository is private, so a link would only
be a dead end for anyone reading this. If you have access you already know where
it is; if you do not, that is the intended state.

**This changes nothing a user or a fork can see.** For the first batch that was
trivially true: nothing in `backend/`, `frontend/`, `mobile-kmp/` or
`.github/workflows/` had ever read those files. The second batch is a weaker
claim honestly stated -- the render subsystem WAS wired in (`app/main.py`
mounted its router) and its removal moved three CI count floors and dropped
eight dependency pins. What did not change is the served product: no endpoint
any client calls, no stored thumbnail, no seeded post and no rendered card is
different, because the three endpoints that left were admin-only and had no
callers. The application still builds, boots, tests and serves, and a fork is
unaffected.

**Their history is still here.** Everything above was public until 2026-08-28
and remains in this repository's git history. The move stops future methodology
work being published; it does not withdraw what already was.

`tools/run_pipeline.sh` and `tools/run_pipeline.ps1` deliberately **stayed**,
because they publish generated posts into this repository and belong where the
repository they publish to lives. They need the private material to run and say
so when it is absent; `PLEXIVE_CONTENT_REPO` points them at a clone of it.
