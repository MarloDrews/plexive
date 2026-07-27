"""
Download all image_url values from docs/content-structure/examples/*.json
and store them in frontend/public/seed-images/.
Replaces the original URLs in the JSON files with /seed-images/<filename>.
Run once after adding a new example file that uses external image URLs.
"""

import json
import os
import re
import sys
import urllib.request

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXAMPLES_DIR = os.path.join(PROJECT_ROOT, "docs", "content-structure", "examples")
DEST_DIR = os.path.join(PROJECT_ROOT, "frontend", "public", "seed-images")

os.makedirs(DEST_DIR, exist_ok=True)

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


for filename in sorted(os.listdir(EXAMPLES_DIR)):
    if not filename.endswith("_example.json"):
        continue

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
