"""
Download all image_url values from the content repository's
docs/content-structure/examples/*.json and store them in
frontend/public/seed-images/.
Replaces the original URLs in the JSON files with /seed-images/<filename>.
Run once after adding a new example file that uses external image URLs.

The examples left this repository on 2026-08-29, so their directory is resolved
through PLEXIVE_CONTENT_REPO -- the same bridge backend/seed.py uses, via
content_repo.resolve_examples(), which exits 1 naming the variable rather than
walking an empty directory and reporting a successful run. (This used to name
tools/run_pipeline.sh; the pipeline runners left this repository with the
generated posts on 2026-08-29 and no longer exist here.) This script WRITES the
files back, so with the variable set it edits the private clone, not this one.
The download destination is unaffected: frontend/public/seed-images/ stayed here.
"""

import json
import os
import re
import sys
import urllib.request

from content_repo import resolve_examples

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST_DIR = os.path.join(PROJECT_ROOT, "frontend", "public", "seed-images")


def _filename_from_url(url: str) -> str:
    """Derive a filesystem-safe filename from a URL."""
    name = url.split("/")[-1].split("?")[0]
    name = re.sub(r"[^a-zA-Z0-9._-]", "_", name)
    return name


def _replace_image_urls(obj: object, url_map: dict) -> object:
    """Recursively replace image_url values using url_map."""
    if isinstance(obj, dict):
        return {k: _replace_image_urls(v, url_map) if k != "image_url" else url_map.get(v, v)
                for k, v in obj.items()}
    if isinstance(obj, list):
        return [_replace_image_urls(item, url_map) for item in obj]
    return obj


def _collect_image_urls(obj: object, found: set) -> None:
    """Walk obj and collect all image_url string values."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "image_url" and isinstance(v, str) and v.startswith("http"):
                found.add(v)
            else:
                _collect_image_urls(v, found)
    elif isinstance(obj, list):
        for item in obj:
            _collect_image_urls(item, found)


def download_image(url: str, dest_dir: str) -> str:
    """Download url into dest_dir, return the /seed-images/<filename> path."""
    filename = _filename_from_url(url)
    dest_path = os.path.join(dest_dir, filename)

    if os.path.exists(dest_path):
        print(f"  already exists: {filename}")
        return f"/seed-images/{filename}"

    print(f"  downloading: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "PlexiveSeedBot/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp, open(dest_path, "wb") as f:
            f.write(resp.read())
        print(f"  saved: {filename}")
    except Exception as e:
        print(f"  FAILED: {url} — {e}", file=sys.stderr)
        return url  # leave original URL if download fails

    return f"/seed-images/{filename}"


EXAMPLES_DIR, EXAMPLE_FILES = resolve_examples()

os.makedirs(DEST_DIR, exist_ok=True)

for filename in EXAMPLE_FILES:
    filepath = os.path.join(EXAMPLES_DIR, filename)
    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)

    urls: set = set()
    _collect_image_urls(data, urls)

    if not urls:
        print(f"{filename}: no external image_url values found")
        continue

    print(f"\n{filename}: found {len(urls)} image URL(s)")
    url_map: dict = {}
    for url in urls:
        url_map[url] = download_image(url, DEST_DIR)

    updated = _replace_image_urls(data, url_map)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(updated, f, ensure_ascii=False, indent=2)
    print(f"  updated {filename}")

print("\nDone. Re-run seed.py to push updated URLs into the database.")
