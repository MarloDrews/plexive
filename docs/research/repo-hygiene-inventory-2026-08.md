# Repo hygiene inventory: backend and web frontend

Date: 2026-08-27. Read-only survey. Nothing was created, modified, committed or pushed
except this file, which is uncommitted.

Every number below was produced by running the tool, not by predicting it. Where a tool
is not installed in the project, it was invoked from a throwaway virtualenv outside the
repository or through `npx --yes`; both are recorded in "Method and provenance" at the end.

---

## 1. Shape and size

### Backend

Layout (tracked files only; `.venv/`, `__pycache__/`, `data/` are untracked):

```
backend/
  app/            22 files   3,951 lines   models, schemas, auth, elo, graph, rate limit
  app/routers/    20 files   5,646 lines   the HTTP + WebSocket surface
  app/thumbnails/ 17 files   5,877 lines   three image generators (geography/mental/concept)
  scripts/        23 files   1,939 lines   one-time DDL + thumbnail CLIs, all run by hand
  tests/          18 files   6,643 lines   16 suites + a harness + a probe
  seed.py                      330 lines
  download_seed_images.py       97 lines
  requirements.txt, requirements-dev.txt, railway.toml, .env.example
  app/thumbnails/assets/mental/  6 PNGs (1.7 MB), angles.json, README.md
```

**102 tracked Python files, 24,483 lines.**

Largest files:

| lines | file |
|---:|---|
| 2,740 | `backend/tests/thumbnails_test.py` |
| 976 | `backend/app/routers/arena.py` |
| 933 | `backend/app/thumbnails/render.py` |
| 887 | `backend/app/routers/stats.py` |
| 823 | `backend/app/thumbnails/generators.py` |
| 711 | `backend/tests/security_test.py` |
| 695 | `backend/app/schemas.py` |
| 636 | `backend/app/routers/chat.py` |
| 513 | `backend/app/thumbnails/projection.py` |
| 512 | `backend/app/routers/battle.py` |

Where the code concentrates: the thumbnail subsystem is **35% of the backend**
(5,877 lines of `app/thumbnails/` + 2,740 lines of its test + ~600 lines of its four
`scripts/make_*.py` and `suggest/generate` CLIs, so about 9,200 of 24,483 lines), and none
of it serves a request path any client calls (see section 7). The request-serving core,
`app/` root plus `app/routers/`, is 9,597 lines across 42 files. Tests are 6,643 lines,
27% of the backend.

So: the backend is roughly one hundred files, not twenty and not four hundred.

### Frontend

```
frontend/
  src/app/         39 files   8,954 lines   App Router pages
  src/components/ 123 files   9,662 lines   84 of them under components/sections/
  src/lib/         47 files   4,993 lines
  src/types/        3 files     559 lines
  test/             5 files     420 lines
  scripts/          1 file      100 lines   analyze-routes.mjs
  .design-sync/    20 tsx +1 mjs  819 lines  committed design-import previews
  next.config.ts (128), eslint.config.mjs (18), postcss.config.mjs (7)
  package.json, package-lock.json, tsconfig.json, .env.example
  public/  12 png, 5 svg, 5 jpg, 1 ico
```

**241 tracked `.ts`/`.tsx`/`.mjs` files, 25,660 lines.**

Largest files:

| lines | file |
|---:|---|
| 1,139 | `frontend/src/components/Arena.tsx` |
| 1,096 | `frontend/src/lib/train/mockQuestions.ts` |
| 881 | `frontend/src/app/stats/GlobalTab.tsx` |
| 838 | `frontend/src/app/create/page.tsx` |
| 749 | `frontend/src/components/Battle.tsx` |
| 740 | `frontend/src/app/post/[id]/page.tsx` |
| 722 | `frontend/src/app/stats/charts.tsx` |
| 688 | `frontend/src/app/profile/page.tsx` |
| 673 | `frontend/src/components/PostCard.tsx` |
| 609 | `frontend/src/app/stats/MyStatsTab.tsx` |

Where the code concentrates: `components/sections/` is 84 files, one per section type, and
they are small. The weight is in five screens: Arena, Battle, the three stats tabs, the
create wizard and the post detail page account for about 5,600 lines between them.

The two codebases are **almost exactly the same size**: 24.5k lines of Python against
25.7k lines of TypeScript.

---

## 2. Toolchain, resolved

### Backend

| Thing | Value | Where it came from |
|---|---|---|
| Python (local dev) | **3.12.10** | `backend/.venv/pyvenv.cfg:3` (`version = 3.12.10`); `.venv/Scripts/python.exe -V` agrees |
| Python (Raspberry Pi) | **3.13 system**, backend runs its own `backend/.venv` | `docs/SERVER.md:16` |
| Python version pin | **none anywhere** | no `pyproject.toml`, no `runtime.txt`, no `.python-version`, no `requires-python` — confirmed by `git ls-files` |
| Dependency manager | **pip + requirements.txt** | `backend/requirements.txt` (30 lines), `backend/requirements-dev.txt` (10 lines) |
| Lockfile | **none** | no `requirements.lock`, no `poetry.lock`, no `uv.lock`, no hashes |
| Version pins | **zero** — every dependency is unpinned | `backend/requirements.txt`, all 14 package lines carry no specifier. `README.md:29` states this explicitly |
| Virtualenv convention | **`backend/.venv`**, activated per platform | `README.md:55-59`; every test docstring says `.venv\Scripts\python.exe tests\<file>.py` |
| Dev start | `uvicorn app.main:app --reload` from `backend/` | `README.md:61` |
| Prod start (Pi) | `uvicorn app.main:app --host 0.0.0.0 --port 8000` under systemd unit `deepscroll-backend` | `docs/SERVER.md:50-53` |
| Prod start (Railway, reference only) | `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, `numReplicas = 1` | `backend/railway.toml:28-29` |
| Hard constraint | exactly one process, one worker, one replica | `backend/railway.toml:3-12`, enforced by a boot guard in `app/main.py` |

Installed in `backend/.venv` today: fastapi 0.136.3, starlette 1.2.0, pydantic 2.13.4,
SQLAlchemy 2.0.50, uvicorn 0.48.0, supabase 2.31.0, httpx 0.28.1, pip_audit 2.10.1,
matplotlib 3.11.1, Pillow 12.2.0. **No ruff, no mypy, no pytest, no black, no flake8** —
verified by `python -m <tool> --version` for each; all five answered `No module named`.

### Frontend

| Thing | Value | Where it came from |
|---|---|---|
| Node (local) | **v24.16.0** | `node -v` |
| Node version pin | **none** | no `.nvmrc`, no `.node-version`, no `engines` field in `frontend/package.json` |
| Node (Pi, for reference) | v24.16.0 via nvm | `docs/SERVER.md:17` |
| Package manager | **npm 11.13.0** | `npm -v`; `frontend/package-lock.json` is the only lockfile (no yarn/pnpm/bun lock) |
| Lockfile | **present**, `lockfileVersion: 3` | `frontend/package-lock.json:4` |
| Next.js | **16.2.6**, pinned exactly | `frontend/package.json:21` |
| React | **19.2.4**, pinned exactly | `frontend/package.json:22-23` |
| TypeScript | `^5`, resolves to **5.9.3** | `frontend/package.json:44`; `npx tsc --version` |
| **`strict`** | **`true`** | `frontend/tsconfig.json:7` |
| Other tsconfig notes | `target: ES2017`, `skipLibCheck: true`, `noEmit: true`, `allowJs: true`, `incremental: true`, `moduleResolution: bundler`, `paths: {"@/*": ["./src/*"]}` | `frontend/tsconfig.json:3-23` |
| tsconfig `include` | `**/*.ts`, `**/*.tsx`, `**/*.mts` from the frontend root, so `.design-sync/previews/*.tsx` is type-checked too | `frontend/tsconfig.json:25-32` |
| ESLint | **v9 flat config**, `eslint-config-next` 16.2.6 (core-web-vitals + typescript) | `frontend/eslint.config.mjs:1-16`, `frontend/package.json:39-40` |
| Tailwind | v4 via `@tailwindcss/postcss` | `frontend/package.json:31,42`, `frontend/postcss.config.mjs` |
| npm scripts | `dev`, `build`, `start`, `lint` (`eslint`), `test` (`node --import tsx --test`), `analyze` | `frontend/package.json:6-11` |
| Deploy target | Vercel, Root Directory `frontend`, one env var `NEXT_PUBLIC_API_URL` baked at build time | `docs/SERVER.md:104-114` |

`skipLibCheck: true` matters for cost: it is why `tsc --noEmit` is 8.8 s rather than minutes.

---

## 3. What already exists that nobody runs

This is the shortest section, and its shortness is the finding.

### Backend

**Nothing.** There is no `pyproject.toml`, no `setup.cfg`, no `ruff.toml`, no `.ruff.toml`,
no `mypy.ini`, no `pytest.ini`, no `tox.ini`, no `.flake8`, no `Makefile`, no
`.pre-commit-config.yaml`. Verified with a repo-wide `git ls-files` filter across all five
top-level directories; zero matches. No linter or type checker is installed in
`backend/.venv` either.

Two fossils show that linting was once contemplated:

- **172 `# noqa:` comments** across 41 files: 154 of them `noqa: E402` (module-level import
  not at top of file), 18 `noqa: F401`, 1 `noqa: A001`. The E402 ones sit on the
  `import _throwaway_db` line that every test file must run before importing the app.
  They are already written in flake8/ruff-compatible syntax. They currently suppress nothing,
  because nothing runs.
- **1 `# type: ignore`**, in `app/thumbnails/catalog.py`.

`requirements-dev.txt:10` declares **`pip-audit`**, and it is installed (2.10.1), with a
comment saying "Run before a release". It is invoked by nothing automated.

### Frontend

Three things are configured, and two of them are wired to scripts that nobody runs:

| Tool | Config | Invoked by | Passes today? |
|---|---|---|---|
| **ESLint 9** | `frontend/eslint.config.mjs` (18 lines, flat config, next core-web-vitals + typescript) | `npm run lint` → bare `eslint` | **No.** `npm run lint` exits 1. 102 errors, 1,249 warnings over everything it walks; **88 errors, 13 warnings** on git-tracked files only |
| **TypeScript strict** | `frontend/tsconfig.json` | `npx tsc --noEmit`, and again inside `next build` | **Yes.** 0 errors |
| **node:test suite** | none needed; `"test": "node --import tsx --test"` | `npm test` | **Yes.** 40 pass, 0 fail |
| Prettier | **not configured, not installed** | nothing | n/a — see section 5 for what it would cost |
| Vitest / Jest / Playwright | **absent entirely** | — | — |

The gap that matters here: `npm run lint` and `npm test` both exist in
`frontend/package.json` and neither is mentioned in CI. `README.md:87` lists
`npm run build`, `npm run start` and `npm run lint` as "other scripts" and **does not
mention `npm test` at all**; the word "test" appears nowhere in `README.md` in a
run-the-tests sense, for either half of the stack.

ESLint's ignore list is worth its own line. `frontend/eslint.config.mjs:9-15` deliberately
re-declares `eslint-config-next`'s defaults (`.next/`, `out/`, `build/`, `next-env.d.ts`)
and stops there, so ESLint also walks the **gitignored** `ds-bundle/` (6.9 MB) and
`.ds-sync/` (29 MB) directories. That is where 1,225 of its 1,351 findings come from,
1,194 of them in a single vendored file, `frontend/ds-bundle/_vendor/react.js`. Flat-config
ESLint does not read `.gitignore`.

---

## 4. Tests

Tests exist for both halves. This directly contradicts the premise in the prompt; see
section 11.

### Backend: 16 suites, ~979 assertions, 14 of 15 runnable suites green

`backend/tests/` holds 18 files: 16 suites, one harness (`_throwaway_db.py`) and one probe
(`perf_probe.py`, which needs a live server and was **not** run here). Every suite imports
`_throwaway_db` first, which pins `DATABASE_URL` to a fresh temp SQLite file and blanks the
Supabase env **before** any app module loads (`backend/tests/_throwaway_db.py:22-33`). No
suite can reach the real database or storage.

Run individually with `.venv\Scripts\python.exe tests\<file>.py`, which is what every
docstring prescribes:

| suite | exit | wall | assertions | covers |
|---|---|---:|---:|---|
| `thumbnails_test.py` | 0 | **125.6 s** | 569 across 92 tests | the whole thumbnail subsystem: projection, GeoJSON, palettes, themes, fonts, place presets, portraits, formulas, storage |
| `arena_test.py` | 0 | 32.3 s | 72 | Arena queue, matchmaking, live matches |
| `security_test.py` | 0 | 16.9 s | 90 | June 2026 security-review regressions (image/SVG sanitizing, authz, caps) |
| `account_lifecycle_test.py` | 0 | 12.4 s | 27 | account deletion, scrambling, sentinel, reserved usernames |
| `query_perf_test.py` | 0 | 8.5 s | 14 | N+1 absence, search pushdown, stats cache |
| `contract_test.py` | 0 | 8.0 s | 38 | the Batch 3 API contract: cursors, reading_minutes, removals |
| `battle_test.py` | 0 | 6.9 s | 30 | battle WS state machine |
| `chat_test.py` | 0 | 6.5 s | 42 | chat rules, history authz, WS auth/broadcast |
| **`smoke_test.py`** | **1** | 5.7 s | fails at check 1 of the Train block | end-to-end quiz/Elo/avatar/search |
| `read_next_endpoint_test.py` | 0 | 4.5 s | 1 | `GET /api/posts/{id}` read_next serialization |
| `primary_category_test.py` | 0 | 4.7 s | 1 | `primary_category_name` derivation |
| `edges_test.py` | 0 | 2.6 s | 37 | `graph_edges.py` latency/activation rules |
| `graph_test.py` | 0 | 2.5 s | 15 | `graph_view.build_edges` connectivity |
| `rate_limit_test.py` | 0 | 2.2 s | 11 | limiter atomicity, window expiry, sweep |
| `report_edges_test.py` | 0 | 1.8 s | 11 | unmatched-latent-edge report |
| `identity_test.py` | 0 | 1.6 s | 21 | identity-key canonicalization + collisions |

**Total wall clock: 242.6 s (4 m 03 s). Without `thumbnails_test.py`: 117 s (1 m 57 s).**

**The one failure is a stale test, not a live bug.**
`backend/tests/smoke_test.py:181` posts `{"question_id": "sci-speed-of-light"}` to
`/api/train/answer` and gets `{"detail": "Unknown question id."}`. That id no longer exists:
commit `481e190` ("new questions roster", 2026-07-22) replaced the whole bank, and
`backend/app/train_bank.py:17-19` documents the removal — "The pool is 100 HARD questions
(the earlier easy starter pool was removed)". `smoke_test.py` was last touched by `7ae123e`
on **2026-07-08**. **The suite has been red for five weeks and nobody noticed**, which is
the clearest single piece of evidence in this document that the tests exist but are not run.

**The suites cannot currently be run in one process.** Only `thumbnails_test.py` uses
`def test_*` functions (92 of them). The other 15 are scripts: 12 of the 16 files have no
`if __name__ == "__main__"` guard at all and execute their entire body at import. Running
`pytest tests` collects **92 tests and 4 collection errors**, and interrupts:

```
ERROR tests/battle_test.py       - AssertionError: {"detail":"Rate limit exceeded"}
ERROR tests/chat_test.py         - AssertionError: {"detail":"Rate limit exceeded"}
ERROR tests/identity_test.py     - AssertionError: FAIL: same title across format...
ERROR tests/report_edges_test.py - AssertionError: FAIL: exactly the two unma...
92 tests collected, 4 errors in 37.89s
```

The cause is structural, not incidental: in one process the modules share one app instance,
one in-memory rate limiter and the first module's temp SQLite file, so they collide. A
pytest gate is therefore not "point pytest at the directory"; it is either a per-file
subprocess loop or a real fixture rewrite.

Files with no `__main__` guard (run at import): `account_lifecycle`, `arena`, `battle`,
`chat`, `edges`, `graph`, `identity`, `primary_category`, `rate_limit`, `read_next_endpoint`,
`report_edges`, `security`. Files with one: `contract`, `query_perf`, `smoke`, `thumbnails`.

### Frontend: 5 files, 40 tests, all green, 4.6 s

`npm test` runs `node --import tsx --test` over `frontend/test/`:

| file | what it covers |
|---|---|
| `guards.test.mjs` | `asArray`, `relativeTime`, `detailToMessage`, `numericMatch`, `safeHref`/`safeImageSrc` scheme filtering |
| `italics.test.mjs` | `splitItalics` — `*italic*` runs vs literal asterisks vs math |
| `gold-routing-scan.test.mjs` | content guard: scans the books/people/concepts/questions example golds for bare `$` and unbalanced `*` |
| `error-boundary.test.mjs` | renders the real `ErrorBoundary` via `react-test-renderer`, proves per-section crash containment |
| `imageUrl.test.mjs` | Wikimedia `Special:FilePath` width sizing |

**40 tests, 40 pass, 0 fail, 4.57 s** (6.25 s including npm startup). Exit code 0.

Coverage shape: these are pure-function tests plus one component-containment test. There is
no route test, no API-client test, no rendering test for any page, and no end-to-end test.
`imageUrl.test.mjs` is not listed in `ARCHITECTURE.md`, which documents the other four.

---

## 5. The cost of turning each check on today

Every number here is from one actual run against `main` at `ff87d4b` with a clean tree.

### Backend

| Check | Command run | Result | Wall |
|---|---|---|---:|
| **Syntax only** | `python -m compileall -q app scripts tests seed.py` | **0 failures** | 0.23 s |
| **App boots** | `import _throwaway_db; from app.main import app` | **passes**, 57 routes | 1.4 s |
| **Ruff, F only (real defects)** | `ruff check --select F` | **7**: 4 unused-import, 2 f-string-without-placeholder, 1 unused-variable. 6 auto-fixable | 0.2 s |
| **Ruff, classic default `E4,E7,E9,F`** | `ruff check --select E4,E7,E9,F` | **44** | 0.2 s |
| **Ruff, 0.16 out-of-the-box defaults** | `ruff check .` | **908**, 652 auto-fixable | 0.2 s |
| **Ruff format** | `ruff format --check .` | **90 of 104 files would be reformatted** (14 already conform) | 0.2 s |
| **mypy, no dependency types** | `mypy --ignore-missing-imports app seed.py scripts tests` | **64 errors in 19 files** (101 checked) | 7.8 s |
| **mypy, real dependency types** | same, `--python-executable backend/.venv/Scripts/python.exe` | **261 errors in 47 files** (101 checked); **190 in `app/` alone** | 54 s cold |
| **The test suite as it is run today** | 15 files, one process each | **14 green, 1 red** (`smoke_test.py`) | 242.6 s |
| **pytest over `tests/`** | `pytest tests` | **collects 92, 4 collection errors, interrupted** | 38 s |

Three of these numbers need their composition spelled out, because the headline is misleading.

**The 44 in the classic ruff set is really 11.** 33 of the 44 are `E712`
(`Avoid equality comparisons to True`) and **every one of them is a SQLAlchemy filter
expression** — `db.query(User).filter(..., User.is_active == True)` at
`backend/app/auth.py:120`, and 32 more like it. Ruff's suggested fix is wrong for this
idiom as written. The remaining 11 are 4 `F401`, 3 `E402`, 2 `F541`, 1 `E731`, 1 `F841`.

**The 908 is an artefact of ruff's version, not of the code.** Ruff 0.16.4 ships a far
broader recommended preset than the old `E4,E7,E9,F` default. The top contributors are
`UP006` non-pep585-annotation (289), `UP045` non-pep604-optional (176), `RUF100`
unused-noqa (155 — these are the pre-existing `# noqa: E402` comments, flagged because
E402 is not in this preset), `B008` function-call-in-default-argument (99 — this is
FastAPI's entire `= Depends(...)` convention, a false positive in every instance), and
`UP035` deprecated-import (71). Filtered of `RUF100` and `B008`, which are noise for this
codebase, the figure is about 654, still dominated by `typing.Optional[X]` → `X | None`
modernization that is mechanically auto-fixable.

**Half of mypy's 261 is one file.** 131 of the 261 error messages name a `Column[...]` type.
`backend/app/models.py` uses the legacy SQLAlchemy declarative style
(`id = Column(Integer, primary_key=True)`, `backend/app/models.py:18-20`) rather than
2.0's `Mapped[int] = mapped_column(...)`, so every ORM attribute types as `Column[str]`
instead of `str` and every function that receives one reports `arg-type`. Rewriting
`models.py`'s 330 lines to `Mapped[...]` would clear roughly half of them in one change.
Error-code split: `arg-type` 130, `assignment` 35, `union-attr` 27, `index` 19,
`attr-defined` 15, `var-annotated` 13, `return-value` 13, `misc` 5, `call-overload` 3,
`list-item` 1. Worst files: `tests/thumbnails_test.py` 32, `app/routers/follows.py` 24,
`app/routers/auth.py` 21, `tests/arena_test.py` 15, `app/routers/chat.py` 14,
`app/elo.py` 11.

Note the 64-vs-261 gap: mypy run without access to the project's installed packages sees
fastapi, sqlalchemy and pydantic as `Any` and reports a quarter as many errors. **261 is
the honest number**; 64 is what you get if you run mypy in a CI job that installs mypy but
not `requirements.txt`.

### Frontend

| Check | Command run | Result | Wall |
|---|---|---|---:|
| **`tsc --noEmit`** | `npx tsc --noEmit` | **0 errors** | 8.8 s |
| **`next build`** | `npm run build` | **passes.** 14 routes, 10 static, 4 dynamic. Runs TypeScript internally (9.9 s of the total) | 42.6 s |
| **`npm test`** | `node --import tsx --test` | **40 pass, 0 fail** | 4.6 s |
| **ESLint, everything it walks** | `npx eslint .` | **1,351 problems: 102 errors, 1,249 warnings** | 19 s warm, ~102 s first run |
| **ESLint, git-tracked files only** | same run, filtered against `git ls-files` | **88 errors, 13 warnings, across 32 files** | — |
| **Prettier (not installed)** | `npx --yes prettier@3 --check src test *.ts *.mjs *.json` | **220 of 247 files differ** | 4.5 s |

**ESLint's tracked-file breakdown** is the number that matters, because the other 1,225
findings are in gitignored generated output.

Errors (88):

| count | rule |
|---:|---|
| 43 | `@typescript-eslint/no-explicit-any` |
| 26 | `react-hooks/set-state-in-effect` |
| 14 | `react-hooks/refs` |
| 4 | `react-hooks/immutability` |
| 1 | `react-hooks/purity` |

Warnings (13): 10 `@next/next/no-img-element`, 2 `react-hooks/exhaustive-deps`,
1 `@typescript-eslint/no-unused-vars`.

Concentration: **`frontend/src/components/SectionRenderer.tsx` alone holds 43 of the 88**
(all of the `no-explicit-any`). The next worst is `Battle.tsx` with 10, then
`sections/QuizSection.tsx` with 5. 21 further files carry 1 to 3 each. So 53 of 88 errors
live in two files.

Notice `no-unused-vars` fires **once** across 241 tracked files. Unused imports and locals
are essentially already clean; the debt is `any` and React 19's new hook rules.

**Prettier's 220 is effectively "the whole codebase".** With no `.prettierrc` the check
runs on Prettier 3 defaults, which differ from this codebase's house style in at least
semicolons (the code omits them). 27 files match by coincidence. This is a whole-tree
reformat, not a cleanup, and it would touch nearly every file in the frontend.

`next build` is a superset of `tsc --noEmit`: it type-checks internally and takes 9.9 s to
do it. It does **not** run ESLint — Next 16 no longer lints during build.

---

## 6. The backend-to-mobile contract

**FastAPI generates an OpenAPI schema and serves it publicly. It is not committed, and
nothing consumes it.**

Measured by importing the app against a throwaway SQLite DB and calling `app.openapi()`:

- OpenAPI **3.1.0**, title `FastAPI`, version `0.1.0` (both left at FastAPI's defaults —
  `backend/app/main.py:90` is a bare `app = FastAPI(lifespan=lifespan)`)
- **45 paths, 50 REST operations, 54 component schemas, about 60 KB of JSON**
- `openapi_url = /openapi.json`, `docs_url = /docs`, `redoc_url = /redoc`, all three at
  their defaults, so all three are live and unauthenticated on `https://api.plexive.org`
- The **3 WebSocket routes** (`/api/arena/ws`, `/api/battle/ws`, `/api/chat/ws`) are absent
  from the schema; FastAPI does not describe WebSockets in OpenAPI. Total route count is 53.

`git ls-files | grep -iE 'openapi|swagger|codegen|\.gen\.'` returns **nothing**. No schema
snapshot is committed for any client, and no generator config exists.

**The mobile Ktor models are hand-written, and they say so.**

`mobile-kmp/shared/src/commonMain/kotlin/com/plexive/mobile/core/model/FeedPost.kt:6-8`:

> "One post as the feed list endpoints return it. **Derived from PostListOut**, which extends
> PostOut in backend/app/schemas.py: only the fields a screen actually shows are modelled,
> the rest are dropped by the parser's ignoreUnknownKeys."

`.../features/auth/data/AuthDtos.kt:6-8` is the same pattern, "taken from LoginRequest and
TokenResponse in backend/app/routers/auth.py". `NetworkModule.kt:36` sets
`json(Json { ignoreUnknownKeys = true })`.

`mobile-kmp` currently models **five fields on one response type**:

```kotlin
data class FeedPost(
    val id: Int,
    val title: String,
    val format: String,
    @SerialName("author_username") val authorUsername: String? = null,
    @SerialName("reading_minutes") val readingMinutes: Int = 1,
)
```

and touches four endpoints: `/api/feed`, `/api/auth/login`, `/api/auth/register`,
`/api/auth/google`.

**Can a backend change silently break the mobile app? Yes, and here is exactly where.**

`ignoreUnknownKeys` makes the contract asymmetric. It protects against **additions**: a new
field on `PostListOut` is dropped and nothing breaks. It gives **no protection against
removals or renames**. kotlinx.serialization throws `MissingFieldException` at parse time
for a `@Serializable` property that has no default and is absent from the payload. So:

- Renaming or removing `id`, `title` or `format` on `PostListOut` gives a **hard parse
  failure**: the feed screen shows an error, and no test on either side catches it. These
  three have no default.
- Renaming `author_username` or `reading_minutes` gives **silent degradation**. Both carry
  defaults (`null` and `1`), so the parse succeeds and the app quietly shows no author and
  "1 min" for every post. This is the worse of the two failure modes, because it looks like
  a content problem, not a build problem.
- The same reasoning applies to `TokenResponse.access_token` and `AuthUser.id`/`username`,
  which are all default-less: renaming any of them breaks sign-in outright.

The narrowness of `mobile-kmp`'s surface is what currently limits the blast radius: five
fields, four endpoints. **The React Native app in `mobile/` is the larger exposure.** It
calls **33 distinct endpoints** (`/api/auth/me`, `/api/chat/conversations/{}/messages`,
`/api/posts/{}`, `/api/quiz/answer`, `/api/stats/me`, `/api/users/{}/follow*`, and more) and,
being TypeScript against a hand-written `mobile/src/types/post.ts`, has no runtime parse
guard at all: a renamed field is `undefined` and surfaces as a rendering bug or a crash.

The backend's own `contract_test.py` freezes parts of the response shape (38 checks:
`reading_minutes` identical on list and detail, cursor paging, `connections` and
`elo.formats` absent). It is a genuine contract test, but it is a **backend-authored** one.
Nothing on either side asserts that `FeedPost.kt`'s five field names still exist in
`PostListOut`.

---

## 7. Obvious bloat and dead weight

Reported as observations with the evidence. Nothing was removed.

### Genuinely dead code (zero importers, verified)

**`frontend/src/lib/train/trainApi.ts` (151 lines): 0 importers.** Nothing in `src/`,
`test/`, `scripts/` or `next.config.ts` references it. Last touched by `c234b70`
("profile view update", 2026-07-16).

**`frontend/src/lib/train/elo.ts` (87 lines): 0 importers.** Its only consumer was
`trainApi.ts`, which is itself dead. The single grep hit is a comment inside the file.

**`frontend/src/lib/train/numeric.ts` (9 lines): 0 importers.**

That is **247 lines of dead TypeScript**. Note what caught it: nothing did. `tsc --noEmit`
is clean and ESLint reports one unused variable in the whole repo, because neither tool
treats an unreferenced *file* as an error. No configured or candidate check in this document
would find this class of debt; that needs a reachability tool such as `knip` or `ts-prune`.

`src/lib/train/mockQuestions.ts` (1,096 lines) and `scoring.ts` are **not** dead — they are
imported by `Arena.tsx`, `Battle.tsx` and `battle/seededQuestions.ts`.

Two files that *look* dead and are not, checked to avoid a false report:
`src/lib/glyphs.ts` (dynamic `import("@/lib/glyphs")` at `FieldGlyph.tsx:14`) and
`src/lib/readAloud/nodeStub.ts` (referenced by `next.config.ts:123` as a turbopack alias).

The backend has **no** dead modules: every `app/*.py` and `app/thumbnails/*.py` file has at
least one importer.

### Endpoints with no client caller

Grepped `frontend/src`, `mobile/src` and `mobile-kmp/shared` for each route path:

| endpoint | callers | note |
|---|---:|---|
| `POST /api/thumbnails/geography` | **0** | admin-gated (`require_admin`) |
| `POST /api/thumbnails/geography/preview` | **0** | admin-gated |
| `GET /api/thumbnails/basemap/status` | **0** | admin-gated |
| `POST /api/upload/svg` | **0** | no admin gate; a live upload-and-parse surface no UI reaches |
| `PATCH /api/admin/posts/{id}/release` | **0** | admin, called by hand |
| `PATCH /api/admin/users/{id}/verify` | **0** | admin, called by hand |
| `GET /health` | 0 in client code | called by the ops runbook, `docs/SERVER.md:160-164`. Not dead |

The thumbnail router is registered at `backend/app/main.py:227` and its import chain pulls
**16 `app.thumbnails.*` modules into the API process at boot** (measured by diffing
`sys.modules` before and after `from app.main import app`), for three endpoints nobody calls.
The documented lazy-import discipline does hold: `matplotlib` and `numpy` stay out
(`matplotlib loaded: False`, `numpy loaded: False`); `PIL` loads. Total modules imported by
`app.main`: 1,100.

`POST /api/upload/svg` is the one worth a second look: it is the only zero-caller endpoint
with no admin gate, and it is an upload-and-parse path.

### Declared but never imported

**Backend: one real finding.** Checking each `requirements.txt` line against imports in
tracked `.py`:

- **`email-validator` is genuinely unused.** No project file imports `email_validator` or
  uses `pydantic.EmailStr`; `backend/app/schemas.py:38` declares `email: str`, a plain
  string. It has been in `requirements.txt` since the very first auth commit (`8260271`,
  2026-05-31) and no code has ever used it. It does get loaded at runtime, but only
  opportunistically by `pydantic.networks`, which falls back to `None` if it is absent.
- Everything else that shows 0 direct imports is a legitimate indirect dependency:
  `uvicorn` (the server binary), `psycopg2-binary` (SQLAlchemy's PostgreSQL driver),
  `python-multipart` (FastAPI form parsing — `UploadFile` is used in `routers/auth.py` and
  `routers/uploads.py`), `httpx` (FastAPI's `TestClient`), `pip-audit` (a CLI).

**Frontend: nothing dead.** All 10 runtime dependencies and all 14 devDependencies are
referenced. `@diffusionstudio/vits-web` shows 0 static imports but is dynamically imported at
`src/lib/readAloud/piper.ts:21` and aliased in `next.config.ts:118-123`.

### Generated, vendored and duplicated

- **`frontend/ds-bundle/`: 6.9 MB, gitignored, but ESLint lints it.** Contains
  `_vendor/react.js` (1,194 ESLint findings on its own) and about 90 duplicated copies of the
  section components under `ds-bundle/components/sections/`. Correctly excluded from git by
  `frontend/.gitignore:48`; correctly excluded from `tsc` by the `tsconfig.json` include
  patterns matching only `.ts`/`.tsx`/`.mts`; **not** excluded from ESLint.
- **`frontend/.ds-sync/`: 29 MB**, same story (`.gitignore:47`).
- **`frontend/.next/`: 645 MB**, `backend/.venv/`: 256 MB. Both gitignored, both normal.
- **`frontend/.design-sync/previews/`: 20 tracked `.tsx` files, 819 lines** of design-import
  preview components. These *are* committed and *are* type-checked and linted (both clean).
  They duplicate the shape of the real section components.
- **The section components exist in three places**: `frontend/src/components/sections/`
  (84 files, committed), `frontend/ds-bundle/components/sections/` (about 90, generated) and
  `mobile/src/components/sections/` (ported by hand). Only the first is the source of truth.
- **`mobile/.verify/`: 83 tracked files** and **`mobile/.claude/`: 13 tracked files**, all
  PNG screenshots. `mobile/.verify/feed.png` at 616 KB is the largest tracked file in the
  repository. Out of scope for this survey, but it is where the repo's tracked weight is.
- **`deepscroll.db` (258 KB) at the repo root and `backend/deepscroll.db*`**: untracked
  SQLite files, one carrying a `.legacy_20260608_114505` suffix. Not in git; sitting on disk.

---

## 8. Deployment reality

### Backend to Raspberry Pi

**Fully manual.** From `docs/SERVER.md:170-176`, the entire update procedure is:

```bash
cd /home/silas/deepscroll && git pull && \
  cd backend && .venv/bin/pip install -r requirements.txt && \
  sudo systemctl restart deepscroll-backend
```

Nothing runs this automatically. `docs/SERVER.md:250-252` lists it as an open to-do:
"Backend-Update auf dem Pi ist manuell. […] Auto-Deploy per systemd-Timer (Self-Pull) wäre
die einfachste Ergänzung."

Topology: FastAPI/uvicorn on port 8000, systemd unit `deepscroll-backend`, single worker,
exposed via a Cloudflare Tunnel at `https://api.plexive.org`. Secrets live outside the repo
at `/etc/deepscroll/backend.env` (`root:root`, `chmod 600`), loaded by systemd's
`EnvironmentFile=`. Database and file storage are Supabase, external to the Pi.

**What a broken commit on `main` does to a running user: nothing, until a human pulls.**
Then it depends on the breakage. A boot-time failure — and this backend has several
deliberate ones: `auth.py` refuses a weak `JWT_SECRET`, `database.py` raises on a missing
`DATABASE_URL`, `main.py` refuses `WEB_CONCURRENCY > 1`, and CORS boot-fails on an empty
origin list — puts systemd into a restart loop and takes the API down completely for every
user of the web app and both mobile apps, until someone reads `journalctl` and reverts.
`docs/SERVER.md:191-197` and `:221-222` document exactly this failure mode as one that has
really happened ("Env-Variablenname falsch […] `KeyError` beim Start → Crash-Schleife").
A logic breakage that still boots serves wrong data indefinitely.

The manual step is currently the only gate. It is a human, on a laptop, deciding to pull.

### Frontend to Vercel

**Automatic.** `docs/SERVER.md:178-180`: "Das Frontend deployt Vercel automatisch beim Push
auf `main`". Root Directory is `frontend`; the single env var `NEXT_PUBLIC_API_URL` is baked
in at **build** time, so changing it requires a rebuild, not a redeploy
(`docs/SERVER.md:109-111`).

**What a broken commit on `main` does to a running user** splits by whether the build
survives.

- A commit that **fails to build** is caught by Vercel's own build step: `next build` runs
  there and it type-checks. On Vercel's standard model the previous deployment stays live, so
  users see no change and the failure is visible only in the Vercel dashboard. This is a real
  gate on build-breaking and type-breaking changes; it just does not block the merge, it
  reports after it. *I could not verify this project's Vercel settings and am describing the
  platform default; see section 12.*
- A commit that **builds and is wrong** goes live to every web user within a couple of
  minutes, with no review step. `next build` does not run ESLint and Vercel does not run
  `npm test`, so nothing the frontend has configured stands between a merge and production.
- There is a **cache trap** on top: `docs/SERVER.md:225-227` records that a fix appearing not
  to land is "fast immer Browser-Cache", so a bad deploy and a stale bundle look alike.

The asymmetry is the point of this section. The half that auto-deploys already has a partial
safety net it did not ask for. The half with no net at all does not auto-deploy.

### Known deployment-adjacent risks already documented

- **No migration tool.** `create_all` on startup adds missing tables but never adds a column
  to an existing table. Every schema change is a hand-run script from `backend/scripts/`
  (23 of them exist). `docs/SERVER.md:253-255` names Alembic as the fix and defers it.
- **All per-IP rate limits share one bucket.** Behind the Cloudflare Tunnel the backend sees
  `127.0.0.1` for every user, so the login limit can lock out everybody at once
  (`docs/SERVER.md:243-249`).
- **Single point of failure.** A power or internet cut at home takes the whole backend down
  (`docs/SERVER.md:256-257`).

---

## 9. Branch hygiene

`git branch -r` shows **11 remote branches including `origin/main`**, so **10 beyond `main`**,
not eleven. Nothing was deleted.

| branch | last commit | merged into `main`? | commits ahead | what it looks like it was for |
|---|---|---|---:|---|
| `spike/static-analysis-toolchain` | 2026-08-26 | **NO** | **5** (25 behind) | **A static-analysis spike you already ran.** Adds ktlint 1.8.0, Detekt 1.23.8 then 2.0.0-alpha.6, and Konsist 0.17.3 in an isolated `architecture-tests` subproject, plus a 455-line writeup at `docs/research/toolchain-spike-2026-08.md`. **`mobile-kmp/` only** — it touches no backend and no frontend file. |
| `integration/facts-all` | 2026-08-26 | yes (2026-08-26, `1a58b18`) | 0 (51 behind) | mobile-kmp shared + androidApp integration work |
| `automatic-thumbnail-generator` | 2026-08-17 | yes (2026-08-17, `0d5f0de`) | 0 (68 behind) | the thumbnail generator subsystem: `backend/app` (18 files), content-structure docs, some frontend |
| `fyp-overhaul-redesign` | 2026-07-27 | yes (2026-07-27, `daffeef`) | 0 (71 behind) | For-You feed card redesign: category glyph in the marker, 16:9 card image slot |
| `ranked-matchmaking-profile-customization` | 2026-07-22 | yes (2026-07-22, `28cb194`) | 0 (84 behind) | Arena ranked play + profile badges/frames |
| `a11y/pre-launch` | 2026-07-09 | yes (2026-07-09, `f480488`) | 0 (162 behind) | pre-launch accessibility pass over 75 frontend files, plus Batch 10 review residuals |
| `fix/resilience` | 2026-07-08 | yes (2026-07-09, `1b6f3bc`) | 0 (222 behind) | resilience guards + Wikimedia thumbnail sizing |
| `perf/frontend-rendering` | 2026-07-07 | yes (2026-07-09, `1b6f3bc`) | 0 (246 behind) | frontend render perf; loading regions |
| `perf/api-contract` | 2026-07-07 | yes (2026-07-07, `3a70630`) | 0 (316 behind) | the Batch 3 API contract work; this is the branch that produced `contract_test.py` |
| `feat/italics-six-golds` | 2026-07-03 | yes (2026-07-05, `2fd6e6e`) | 0 (513 behind) | italics routing across six content golds; category glyph overlay |

Every branch except `spike/static-analysis-toolchain` is **fully merged and has zero commits
that `main` does not already contain**. `fix/resilience` and `perf/frontend-rendering` were
merged in the same commit `1b6f3bc`, which is why their historical scopes read identically.

Also present but not asked about: **13 local branches**, of which 11 are merged leftovers and
one (`ci/android-build`) tracks a remote that is already gone. One tag,
`archive/redesign-explore-3`.

---

## 10. Ranked: cheapest useful checks, cheapest first

Ranked by cost-to-green, meaning how much work stands between the check and a passing run
today. The runtime column is what the check costs per invocation. No sequencing or
recommendation is implied.

| # | Check | Side | Violations today | Runtime | What "cheap" means here |
|---:|---|---|---:|---:|---|
| 1 | `tsc --noEmit` | FE | **0** | 8.8 s | Already green under `strict: true`. Zero cleanup. |
| 2 | `npm test` (node:test) | FE | **0** (40/40 pass) | 4.6 s | Already green. Zero cleanup. |
| 3 | `next build` | FE | **0** | 42.6 s | Already green. Superset of #1. |
| 4 | `python -m compileall` | BE | **0** | 0.23 s | Syntax only. Catches nothing subtle, costs nothing. |
| 5 | App-boots smoke (`import app.main`) | BE | **0** | 1.4 s | Would catch every boot-guard failure, the exact class that crash-loops the Pi. |
| 6 | `ruff check --select F` | BE | **7** (6 auto-fixable) | 0.2 s | Pyflakes only: unused imports, unused variable, empty f-strings. |
| 7 | `ruff check --select E4,E7,E9,F` | BE | **44** | 0.2 s | **11 real**; the other 33 are SQLAlchemy `== True` filters needing a per-line ignore or a rule opt-out. |
| 8 | Backend suite, current per-file loop | BE | **1 red of 15** | 242.6 s (117 s without `thumbnails_test`) | One stale question id at `smoke_test.py:181`. A one-line fix, then green. |
| 9 | ESLint on **tracked files only** | FE | **88 errors, 13 warnings**, 32 files | 19 s | 53 of the 88 sit in two files (`SectionRenderer.tsx` 43, `Battle.tsx` 10). 43 are `no-explicit-any`; 45 are React 19 hook rules. |
| 10 | ESLint as currently configured | FE | **102 errors, 1,249 warnings** | 19 s | Same check, but it walks gitignored `ds-bundle/` and `.ds-sync/`. 1,225 of the findings are in generated output. |
| 11 | `mypy --ignore-missing-imports`, no deps installed | BE | **64**, 19 files | 7.8 s | Cheap only because it sees fastapi/sqlalchemy as `Any`. Weak signal. |
| 12 | `ruff format --check` | BE | **90 of 104 files** | 0.2 s | Whole-tree reformat. Fast to run, large diff. |
| 13 | pytest over `backend/tests/` | BE | **collects 92 of ~979 assertions; 4 collection errors; interrupted** | 38 s | Structural: 12 of 16 files run at import and collide over one app instance, one rate limiter, one temp DB. |
| 14 | `mypy` with real dependency types | BE | **261**, 47 files (**190 in `app/`**) | 54 s | **131 mention `Column[...]`**; a `models.py` `Mapped[...]` rewrite clears about half. |
| 15 | `ruff check` on 0.16 defaults | BE | **908** (652 auto-fixable) | 0.2 s | 155 are unused-noqa, 99 are FastAPI's `Depends()` idiom. About 654 after filtering those, mostly auto-fixable `Optional` modernization. |
| 16 | Prettier (not installed, no config) | FE | **220 of 247 files** | 4.5 s | Reformats nearly the whole frontend on defaults that disagree with the house style. |

Two checks are not on this list because they do not exist anywhere yet and I did not want to
invent a number for them: an OpenAPI-versus-mobile-DTO contract check (section 6), and an
unreferenced-file check that would catch the 247 dead lines in section 7.

---

## 11. What contradicts the prompt

Four things.

**1. "The backend and the web frontend have no automated checks at all and never have."**
Both have tests, and the backend's are substantial. `backend/tests/` is **6,643 lines, 16
suites, about 979 assertions**, which is 27% of the backend by line count. `frontend/test/`
is 5 files and 40 tests. The frontend also has ESLint configured
(`frontend/eslint.config.mjs`), TypeScript strict mode on (`frontend/tsconfig.json:7`), and
`lint` and `test` npm scripts. The accurate statement is **"nothing is enforced"**, not
"nothing exists". The distinction changes the cost of everything in section 10: much of the
work is already paid for, and what is missing is a runner and a required check.

**2. The premise that this order is purely inherited from a mobile brief.** The mobile module
did get the first gate, but the backend already carries a defence the mobile module does not:
boot guards that refuse to start on a weak `JWT_SECRET`, a missing `DATABASE_URL`,
`WEB_CONCURRENCY > 1`, or an empty CORS origin list. Those turn a class of misconfiguration
into a loud crash rather than a silent compromise. It is not the same as a gate — nothing
stops the bad commit reaching `main` — but the backend is not undefended.

**3. "Eleven remote branches exist beyond the ones just cleaned up."** There are **ten**
beyond `main`; eleven is the count including `main`. Nine of the ten are fully merged with
zero unique commits. The tenth is not.

**4. That tenth branch is a static-analysis spike you have already run.**
`origin/spike/static-analysis-toolchain` (2026-08-26, 5 commits, unmerged) adds ktlint,
Detekt and Konsist plus a **455-line findings document** at
`docs/research/toolchain-spike-2026-08.md`. It is scoped entirely to `mobile-kmp/` and
touches no backend or frontend file, so it does not overlap this inventory, but it is
directly adjacent prior work on the same question, and it sets the convention this file
follows.

One smaller correction, to a claim in the repo rather than in the prompt: `ARCHITECTURE.md`
documents four files under `frontend/test/`. There are five; `imageUrl.test.mjs` is
undocumented.

---

## 12. What I could not determine, and what would settle it

| Open question | Why I could not answer it | What would settle it |
|---|---|---|
| **What Vercel actually does with a failed build.** I described the platform default: previous deployment stays live, failure visible only in the dashboard. | The Vercel project settings are not in this repository, and reaching Vercel was outside the read-only, no-external-calls boundary. | Open the Vercel project's Git settings: whether `main` auto-deploys to production, whether preview deployments are on, and whether an "Ignored Build Step" is configured. One screenshot answers it. |
| **Whether the Pi's `main` matches `origin/main` right now.** | No calls to the Pi or the production backend were permitted. | On the Pi: `cd /home/silas/deepscroll && git rev-parse HEAD` against `ff87d4b`. This also tells you how long the manual-deploy lag actually runs in practice, which is the real measure of how urgent a backend gate is. |
| **Which Python version production actually runs.** `docs/SERVER.md:16` says system 3.13 with a venv; local dev is 3.12.10; nothing is pinned. | The venv's own `pyvenv.cfg` is on the Pi. | On the Pi: `backend/.venv/bin/python -V`. If it is 3.13 and dev is 3.12, any gate has to pick one, and ruff's `target-version` and mypy's `--python-version` both need the answer. |
| **Which dependency *versions* production resolved to.** `requirements.txt` pins nothing, so the Pi's `pip install -r` on any given day can differ from this laptop's. | Same reason. | On the Pi: `backend/.venv/bin/pip freeze`. Diffing it against the local `pip list` in section 2 measures the drift the missing lockfile has already allowed. |
| **Whether `smoke_test.py` is the only stale test.** I proved that one is stale; the other 14 pass, but passing does not prove they still assert the current contract. | Would require reading all 6,643 test lines against the current code. Out of scope for an inventory. | Nothing cheap. A mutation-testing pass, or simply the first CI run after each suite is fixed. |
| **What the real ESLint error count would be under a project-appropriate ignore list.** I filtered against `git ls-files` to get 88; the ignore list a gate would actually use might differ. | The right ignore set is a decision, not a measurement. | Add `ds-bundle/**` and `.ds-sync/**` to `globalIgnores` in `frontend/eslint.config.mjs` and re-run. I did not change the file. |
| **Whether the 33 SQLAlchemy `E712` sites are safe to rewrite.** Ruff's suggested fix (`filter(User.is_active)`) is valid SQLAlchemy 2.0, but I did not test the rewrite. | Testing it means changing code, which this session does not do. | Rewrite one site and run `contract_test.py` plus `security_test.py`. |
| **Whether `POST /api/upload/svg` is intentionally kept or forgotten.** It is the only zero-caller endpoint with no admin gate. | Cannot be answered from the code; it is a product decision. | Your call. The evidence is that no client in `frontend/`, `mobile/` or `mobile-kmp/` references it. |
| **How long these checks take on GitHub Actions runners.** All timings above are from this Windows laptop. | No CI run was triggered. | The first workflow run. Expect Linux runners to be faster on the Python side and roughly comparable on Node, with cold `npm ci` (about 30 to 60 s) and `pip install -r requirements.txt` (about 60 to 90 s, unpinned and uncached) added to every job. |

---

## Method and provenance

Read-only. No branch was created, nothing was committed, nothing was pushed, no file in the
repository was modified. `git status --short` is empty at the end of this session, as it was
at the start.

**No database operation of any kind was performed.** Every command that imports the backend
first imports `backend/tests/_throwaway_db.py`, which pins `DATABASE_URL` to a fresh temp
SQLite file and blanks `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` **before** any app module loads.
No call was made to `api.plexive.org`, to the Pi, to Supabase or to Vercel.

**Tools not present in the project, and how they were run:**

- `ruff` 0.16.4, `mypy` 2.3.1 and `pytest` 9.1.1 were installed into a **throwaway
  virtualenv outside the repository**, under this session's scratchpad directory.
  `backend/.venv` was **not modified**, verified afterwards:
  `pip list | grep -icE '^(ruff|mypy|pytest)'` returns `0`.
- mypy's headline run used `--python-executable` pointed at
  `backend/.venv/Scripts/python.exe` so it could see the project's real
  fastapi/sqlalchemy/pydantic types. That flag reads the venv; it does not write to it.
- `prettier` 3 was run via `npx --yes prettier@3`, which caches into the **global npm cache**
  (`~/.npm/_npx`), not into `frontend/node_modules`. `frontend/package.json` and
  `package-lock.json` are unchanged.
- `python -m compileall` refreshed `__pycache__/` directories that already existed and are
  already gitignored. Nothing else on disk changed.

**Measured by running, not by reading:** every violation count, every wall-clock figure, the
test results, the OpenAPI shape (45 paths, 50 operations, 54 schemas), the route list
(53 routes), the module-import surface of `app.main` (1,100 modules; matplotlib and numpy
absent), and the branch merge status.

**Read but not run:** `docs/SERVER.md` for the deployment topology, and the Vercel behaviour
described in section 8, which is the platform default rather than a verified project setting.

**Partial results, stated as such:** `backend/tests/perf_probe.py` was **not** run; it
requires a live backend. `pytest` over `backend/tests/` interrupted after 4 collection errors
and is reported at that point rather than forced through. ESLint's first invocation took
about 102 s and subsequent ones about 19 s; the tables use the warm figure.
`ARCHITECTURE.md` is 277 KB and was read in the sections relevant to this survey (folder
structure, deployment invariant, security, current status) rather than end to end.

One deviation from `CLAUDE.md` worth flagging: the rule "after every change, update
ARCHITECTURE.md" was not applied, because this session was scoped to produce one uncommitted
research document and change nothing else. If this file is committed, it wants one line in
`ARCHITECTURE.md` under `docs/research/`.
