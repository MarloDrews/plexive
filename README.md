# Plexive

A free, ad-free, open-source app that replaces doomscrolling with long-form knowledge.

Plexive keeps the familiar feed format of a social app, but fills it with content worth your time: book summaries, facts, profiles of people, explained concepts, open questions, and narrative stories. It is community-driven and meant to stay permanently free. Plexive is licensed under AGPL-3.0.

<!-- TODO: add screenshots or a short demo clip here. -->

## Content formats

Posts are organized into seven formats. Each post is a structured document, not a one-line status.

- **Books** summaries and key takeaways.
- **Facts** with real depth, not trivia.
- **People** and the lives behind them.
- **Concepts** and mental models, explained.
- **Questions** and thought experiments worth sitting with.
- **Stories** that read like a thriller.
- **Academy** structured learning material.

A graph view that links related posts (in the style of Obsidian) is planned and not yet built.

## Tech stack

- **Backend:** Python, FastAPI, SQLAlchemy. Data lives in Supabase (PostgreSQL); uploads go to Supabase Storage. (`backend/requirements.txt`)
- **Web:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4. (`frontend/package.json`)
- **Mobile:** Kotlin Multiplatform with Compose Multiplatform, targeting Android and iOS. Early: it builds and runs on Android, and has not yet been linked or run on iOS. (`mobile-kmp/`)

Backend dependency versions are pinned exactly, to what the production server runs (`backend/requirements.txt`); the versions above are the major versions the project currently builds against.

## Repository structure

```
backend/    FastAPI + SQLAlchemy API, Supabase PostgreSQL and Storage
frontend/   Next.js web app (App Router, TypeScript, Tailwind)
mobile-kmp/ Kotlin Multiplatform mobile app (Compose Multiplatform, Android + iOS)
docs/       Content model, style and layout standards, roadmap
LICENSE         AGPL-3.0
ARCHITECTURE.md One-line-per-item map of the codebase
```

## Local development

### Prerequisites

- Python 3.13 (the deployment runs 3.13; a recent 3.11+ should work).
- A current Node.js LTS (the deployment runs Node 24).
- A Supabase project, or any PostgreSQL database reachable through `DATABASE_URL`, plus Supabase Storage for image uploads.

Run each part in its own terminal. Start the backend first so the web and mobile apps have an API to talk to.

### Backend

```bash
cd backend
python -m venv .venv
# Windows:        .venv\Scripts\activate
# macOS / Linux:  source .venv/bin/activate
pip install -r requirements.txt
cp .env .env   # then fill in the values below
uvicorn app.main:app --reload
```

The API serves on `http://localhost:8000`. Check `http://localhost:8000/health`; it should return `{"status":"ok"}`.

Environment variables the backend reads (set them in `backend/.env`; see `backend/.env.example` for the format, and never commit real values):

- `JWT_SECRET` token-signing secret. Generate one with `python -c "import secrets; print(secrets.token_hex(32))"`.
- `DATABASE_URL` PostgreSQL connection string (the Supabase URI).
- `SUPABASE_URL` your Supabase project URL.
- `SUPABASE_SERVICE_KEY` Supabase service role key (server-side only, keep it secret).
- `FRONTEND_ORIGIN` optional, comma-separated allowed CORS origins. Defaults to `http://localhost:3000`.

To load sample content into the database, set `SEED_ADMIN_PASSWORD` in `backend/.env` and run `python seed.py` from the `backend/` directory. This is optional and writes to whatever database `DATABASE_URL` points at.

### Web

```bash
cd frontend
npm install
cp .env .env.local   # sets NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

The web app serves on `http://localhost:3000`. It reads one environment variable, `NEXT_PUBLIC_API_URL`, which must point at the running backend.

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

### Mobile

The mobile app is a Kotlin Multiplatform project under `mobile-kmp/`, with its own Gradle build and wrapper. See `mobile-kmp/README.md` for prerequisites and how to run it; it needs an Android SDK, and the iOS target needs a Mac.

It reads the backend URL from `plexive.api.baseUrl` in `mobile-kmp/gradle.properties`, which defaults to the deployed API rather than a local one.

## Contributing

Contributions are welcome. There is no separate contributing guide yet, so for now: open an issue to discuss a change, keep pull requests focused, and write clear commit messages. `ARCHITECTURE.md` is the fastest way to find your way around the codebase, and the standards under `docs/content-structure/` define how content is shaped.

## License

Plexive is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) map of every module and component.
- [Content structure](docs/content-structure/PLEXIVE_CONTENT_STRUCTURE.md) the post and section schema.
- [docs/content-structure/STYLE_GUIDE_LONGFORM.md](docs/content-structure/STYLE_GUIDE_LONGFORM.md) writing style for long-form content.
- [docs/content-structure/LAYOUT_STANDARD.md](docs/content-structure/LAYOUT_STANDARD.md) how posts are laid out and rendered.
- [docs/content-structure/IMAGE_STANDARD.md](docs/content-structure/IMAGE_STANDARD.md) and [SVG_STANDARD.md](docs/content-structure/SVG_STANDARD.md) image and SVG rules.
- [docs/content-structure/ROADMAP.md](docs/content-structure/ROADMAP.md) what is planned next.
