## Legacy Seed Content

The file `seed_content.json` (gitignored, not committed) was the legacy seed data for Plexive before the section-based schema migration on 2026-06-08.

That file used the old per-format `details` JSON structure, with fields like `hook`, `key_points`, `takeaway`, `source_url`, `image_url`, and a format-specific `details` object (e.g. `{ "author": "...", "isbn": "..." }` for books). Eighteen posts across all six original formats (books, facts, people, concepts, questions, stories) were included.

The DB snapshot before this migration is preserved at `backend/deepscroll.db.legacy_20260608_*`. If we want to migrate any of these posts to the new section-based schema later, we will write a separate migration script to read from that backup and transform each post's fields into the appropriate `sections` array and `feed_card` object.
