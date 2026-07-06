# Plexive Frontend

The Next.js (App Router, TypeScript, Tailwind) web client for Plexive, an open
source social app that replaces doomscrolling with valuable content. It talks to
the FastAPI backend in `../backend`; on its own the feed is empty.

## Setup

1. Start the backend (see `../backend`).
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL` to the
   backend URL (e.g. `http://localhost:8000`).
3. Install and run:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Tests

```bash
npm run test
```

Runs the `node --test` suites in `test/`.
