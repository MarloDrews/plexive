"""Ask a model for a thumbnail spec for every generated post.

Walks the post JSONs under docs/content-structure/generated/, asks KI:connect
which generator fits each one (app/thumbnails/suggest.py) and writes the chosen
spec into the file's top-level "thumbnail" object. Nothing is rendered here --
that stays with scripts/generate_thumbnails.py, which picks the specs up after
the posts are seeded.

Run manually from backend/ -- never imported or called by the app:

    venv\\Scripts\\python.exe scripts\\suggest_thumbnails.py --dry-run
    venv\\Scripts\\python.exe scripts\\suggest_thumbnails.py
    venv\\Scripts\\python.exe scripts\\suggest_thumbnails.py --slug sahara-is-growing --force --check

The default target is every post that has no thumbnail yet. A post the model
declines is left without one and shows the placeholder image -- that is the
expected outcome for most posts, and it is counted separately from a failure.

Needs KICONNECT_API_KEY and KICONNECT_MODEL in backend/.env (see .env.example).
"""

import argparse
import functools
import json
import os
import sys

# A full run is one model call per post and takes minutes. Unflushed stdout is
# buffered when it is not a terminal, which would hold every line back until
# the very end -- exactly when progress stops being useful.
print = functools.partial(print, flush=True)  # noqa: A001

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
POSTS_DIR = os.path.join(REPO_ROOT, "docs", "content-structure", "generated")

load_dotenv(os.path.join(BACKEND_DIR, ".env"))

from app.kiconnect import KiConnectError  # noqa: E402
from app.thumbnails.generators import render_from_spec  # noqa: E402
from app.thumbnails.suggest import SuggestionError, suggest_thumbnail_spec  # noqa: E402

# The order a post JSON's top-level keys are written back in. "thumbnail" sits
# between the metadata and the content, where the hand-authored post already
# has it; anything not listed keeps its original position at the end.
KEY_ORDER = ("tags", "connections", "thumbnail", "feed_card", "sections")


def find_posts(args):
    """The post files to consider, as (format, path) pairs.

    Files starting with "_" are batch notes and running tallies, not posts.
    """
    found = []
    for fmt in sorted(os.listdir(POSTS_DIR)):
        if args.format and fmt != args.format:
            continue
        folder = os.path.join(POSTS_DIR, fmt)
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            if not name.endswith(".json") or name.startswith("_"):
                continue
            if args.slug and name[: -len(".json")] != args.slug:
                continue
            found.append((fmt, os.path.join(folder, name)))
    return found


def write_thumbnail(path: str, post: dict, spec: dict) -> None:
    """Put `spec` into the post file, changing nothing else.

    The file is rebuilt rather than patched, so the key order has to be
    restored deliberately. Every post file already round-trips byte-identically
    through this dump, which keeps the diff to the added block.
    """
    post["thumbnail"] = spec
    ordered = {key: post[key] for key in KEY_ORDER if key in post}
    ordered.update({key: value for key, value in post.items() if key not in ordered})
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(ordered, indent=2, ensure_ascii=False) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Choose thumbnail specs for posts.")
    parser.add_argument("--format", help="Only this post format (the folder name).")
    parser.add_argument("--slug", help="Only this post (its filename without .json).")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-decide posts that already have a thumbnail spec.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be written, touch nothing.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Render each chosen spec and throw the PNG away, to catch a place "
        "name that resolves to nothing. Slow: downloads the basemap once and "
        "place lookups are rate limited to 1/s.",
    )
    parser.add_argument("--limit", type=int, help="Stop after N posts.")
    parser.add_argument("--model", help="Override KICONNECT_MODEL for this run.")
    parser.add_argument(
        "--default-temperature",
        action="store_true",
        help="Leave temperature out of the request. Needed for models that "
        "accept only their own default (gpt-5.5 answers 400 to any value).",
    )
    args = parser.parse_args()
    temperature = None if args.default_temperature else 0.0

    posts = find_posts(args)
    if not posts:
        print("no post files matched")
        return 0

    written = declined = failed = skipped = 0
    for fmt, path in posts:
        if args.limit and written + declined + failed >= args.limit:
            break
        slug = os.path.basename(path)[: -len(".json")]

        with open(path, encoding="utf-8") as handle:
            post = json.load(handle)
        if post.get("thumbnail") and not args.force:
            skipped += 1
            continue

        try:
            suggestion = suggest_thumbnail_spec(
                post, post_format=fmt, model=args.model, temperature=temperature
            )
        except (SuggestionError, KiConnectError) as exc:
            # One post the model fumbles must not abandon a 50-post run.
            print(f"FAILED {slug}: {exc}", file=sys.stderr)
            failed += 1
            continue

        if not suggestion.fits:
            print(f"no fit {slug}: {suggestion.reason}")
            declined += 1
            continue

        if args.check:
            try:
                render_from_spec(suggestion.spec)
            except Exception as exc:
                print(f"FAILED {slug}: spec does not render: {exc}", file=sys.stderr)
                failed += 1
                continue

        spec_text = json.dumps(suggestion.spec, ensure_ascii=False)
        if args.dry_run:
            print(f"would write {slug}: {spec_text}  ({suggestion.reason})")
        else:
            # Written as each post finishes, so an interrupted run keeps
            # everything decided so far.
            write_thumbnail(path, post, suggestion.spec)
            print(f"{slug}: {spec_text}")
        written += 1

    print(
        f"done: {written} chosen, {declined} no fit, {failed} failed, "
        f"{skipped} already had one"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
