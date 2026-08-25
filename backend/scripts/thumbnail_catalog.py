"""Print the thumbnail generator catalog, or regenerate its doc.

The catalog is built from the GeneratorInfo descriptors in
app/thumbnails/generators.py. This script is how you look at it:

    venv\\Scripts\\python.exe scripts\\thumbnail_catalog.py            # markdown
    venv\\Scripts\\python.exe scripts\\thumbnail_catalog.py --json     # what the model sees
    venv\\Scripts\\python.exe scripts\\thumbnail_catalog.py --write-doc

--json prints exactly the payload scripts/suggest_thumbnails.py puts in the
prompt, which is worth reading before spending tokens on a full run.
--write-doc rewrites docs/content-structure/THUMBNAIL_GENERATORS.md; run it
after adding or changing a generator.
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.thumbnails.catalog import catalog_json, catalog_markdown  # noqa: E402
from app.thumbnails.generators import GENERATORS  # noqa: E402

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOC_PATH = os.path.join(
    os.path.dirname(BACKEND_DIR), "docs", "content-structure", "THUMBNAIL_GENERATORS.md"
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Show the thumbnail generator catalog.")
    parser.add_argument("--json", action="store_true", help="Print the JSON a model is shown.")
    parser.add_argument(
        "--write-doc",
        action="store_true",
        help=f"Rewrite {os.path.relpath(DOC_PATH, os.path.dirname(BACKEND_DIR))}.",
    )
    args = parser.parse_args()

    if args.json:
        print(json.dumps(catalog_json(GENERATORS), ensure_ascii=False, indent=2))
        return 0

    markdown = catalog_markdown(GENERATORS)
    if args.write_doc:
        with open(DOC_PATH, "w", encoding="utf-8") as handle:
            handle.write(markdown)
        print(f"wrote {DOC_PATH}")
        return 0

    print(markdown)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
