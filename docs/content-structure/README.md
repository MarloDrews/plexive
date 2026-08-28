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

No URL is given here on purpose: the repository is private, so a link would only
be a dead end for anyone reading this. If you have access you already know where
it is; if you do not, that is the intended state.

**This changes nothing about the application.** Nothing in `backend/`,
`frontend/`, `mobile-kmp/` or `.github/workflows/` ever read those files, so the
application still builds, boots, tests and serves exactly as before, and a fork
of this repository is unaffected. What left was editorial process, not code.

**Their history is still here.** Everything above was public until 2026-08-28
and remains in this repository's git history. The move stops future methodology
work being published; it does not withdraw what already was.

`tools/run_pipeline.sh` and `tools/run_pipeline.ps1` deliberately **stayed**,
because they publish generated posts into this repository and belong where the
repository they publish to lives. They need the private material to run and say
so when it is absent; `PLEXIVE_CONTENT_REPO` points them at a clone of it.
