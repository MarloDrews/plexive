"""Render the missing post thumbnails and store them on Supabase.

Walks the posts that carry a thumbnail spec but no image yet, renders each one
(app/thumbnails/generators.py), uploads the PNG to Supabase Storage
(app/thumbnail_storage.py) and writes the public URL onto the post row. Run
manually from backend/ -- never imported or called by the app:

    .venv\\Scripts\\python.exe scripts\\generate_thumbnails.py
    .venv\\Scripts\\python.exe scripts\\generate_thumbnails.py --dry-run
    .venv\\Scripts\\python.exe scripts\\generate_thumbnails.py --slug sahara-is-growing --force

Idempotent: a post that already has a thumbnail_url is skipped unless --force.
One post per commit, so a failure halfway keeps everything rendered so far.
The first geography render downloads the Natural Earth basemap (~4 MB) into
backend/data/; place lookups are rate limited and cached inside the service.
"""

import argparse
import os
import sys

# A Windows console is cp1252, and a model writes captions with typographic
# punctuation in them -- a non-breaking hyphen in "Flat-Earth" is enough. Left
# alone, printing one raises UnicodeEncodeError and takes the whole run down
# partway through, after real work has been done. The renderer already swaps
# these characters for ASCII when it draws them (render.TEXT_REPLACEMENTS);
# this is the same problem one layer out, at the terminal.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from app.database import SessionLocal  # noqa: E402
from app.models import Post  # noqa: E402
from app.thumbnail_storage import upload_thumbnail_png  # noqa: E402
from app.thumbnails.generators import render_from_spec  # noqa: E402


def storage_key(post: Post) -> str:
    """Filename stem for this post's image. Slug where there is one (readable
    in the storage browser), the id otherwise -- user posts have no slug."""
    return post.slug or f"post-{post.id}"


def select_posts(db, args):
    query = db.query(Post).filter(Post.thumbnail_spec.isnot(None))
    if args.slug:
        query = query.filter(Post.slug == args.slug)
    if not args.force:
        query = query.filter(Post.thumbnail_url.is_(None))
    query = query.order_by(Post.id)
    if args.limit:
        query = query.limit(args.limit)
    return query.all()


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate and store post thumbnails.")
    parser.add_argument("--slug", help="Only this post (by its seed slug).")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-render posts that already have a thumbnail.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List what would be rendered, touch nothing.",
    )
    parser.add_argument("--limit", type=int, help="Stop after N posts.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        posts = select_posts(db, args)
        if not posts:
            print("nothing to do -- no post has a thumbnail spec without an image")
            return 0

        if args.dry_run:
            for post in posts:
                spec = post.thumbnail_spec or {}
                print(f"would render {storage_key(post)}  [{spec.get('generator')}]")
            print(f"{len(posts)} post(s) pending")
            return 0

        done = failed = 0
        for post in posts:
            key = storage_key(post)
            try:
                png = render_from_spec(post.thumbnail_spec)
                url = upload_thumbnail_png(png, key)
            except Exception as exc:
                # One unresolvable place name or one storage hiccup must not
                # abandon the rest of the run.
                print(f"FAILED {key}: {exc}", file=sys.stderr)
                db.rollback()
                failed += 1
                continue
            post.thumbnail_url = url
            db.commit()
            done += 1
            print(f"{key} -> {url}")

        print(f"done: {done} rendered, {failed} failed")
        return 1 if failed else 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
