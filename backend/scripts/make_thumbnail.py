"""Generate a geography thumbnail from the command line.

Faster than going through the API when you just want a PNG on disk, and it
does not need a running server or an admin token.

    python backend/scripts/make_thumbnail.py "Mediterranean Sea" \
        --caption "ALMOST DRIED UP" --palette blue -o med.png

    # Several at once (one per line: place | caption | palette, palette optional).
    # --theme and --font apply to every row of a batch.
    python backend/scripts/make_thumbnail.py --batch places.txt --out-dir out/

The first run downloads the Natural Earth basemap (~4 MB) into backend/data/.
"""

import argparse
import re
import sys
from pathlib import Path

# Run as a plain script from anywhere: put backend/ on the import path so
# `app.*` resolves without needing an installed package.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.thumbnails.nominatim import GeoLookupError  # noqa: E402
from app.thumbnails.service import (  # noqa: E402
    FONT_NAMES,
    PALETTE_NAMES,
    THEME_NAMES,
    render_geography_thumbnail,
)


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "thumbnail"


def looks_like_osm_id(value: str) -> bool:
    """True for "R9407"-style ids, false for "Romania"."""
    value = value.strip().upper()
    return len(value) > 1 and value[0] in "NWR" and value[1:].isdigit()


def generate(place: str, caption: str, palette: str, args, output: Path) -> None:
    is_id = looks_like_osm_id(place)
    under_land = True if args.under_land else (False if args.over_land else None)
    thumbnail = render_geography_thumbnail(
        place=None if is_id else place,
        osm_id=place if is_id else None,
        caption=caption,
        padding=args.padding,
        width=args.width,
        height=args.height,
        uppercase=not args.keep_case,
        highlight_under_land=under_land,
        clip_to_land=not args.no_clip,
        source=args.source,
        palette=palette,
        theme=args.theme,
        font=args.font,
        seed=args.seed,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(thumbnail.png)
    print(
        f"{output}  <- {thumbnail.place_name}  "
        f"[{thumbnail.source}/{thumbnail.palette}/{thumbnail.theme}/{thumbnail.font}]"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a geography thumbnail.")
    parser.add_argument("place", nargs="?", help='Place name, or an OSM id like "R9407".')
    parser.add_argument("--caption", default="", help="Text in the banner.")
    parser.add_argument(
        "--palette",
        choices=PALETTE_NAMES,
        default="auto",
        help="Colour profile for the marked region and its banner.",
    )
    parser.add_argument(
        "--theme",
        choices=THEME_NAMES,
        default="auto",
        help="Dark or light basemap. auto derives it from the subject.",
    )
    parser.add_argument(
        "--font",
        choices=FONT_NAMES,
        default="sans",
        help="Caption typeface: the plain heavy sans, or the dressier serif.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        help="Pin the caption's random tilt and sideways nudge (same seed, same card).",
    )
    parser.add_argument("-o", "--output", help="Output PNG path.")
    parser.add_argument("--batch", help='File of "place | caption" lines.')
    parser.add_argument("--out-dir", default="thumbnails", help="Output folder for --batch.")
    parser.add_argument("--padding", type=float, default=0.35, help="Context around the region.")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--keep-case", action="store_true", help="Do not uppercase the caption.")
    parser.add_argument(
        "--under-land", action="store_true", help="Force the red shape below the landmass."
    )
    parser.add_argument(
        "--over-land", action="store_true", help="Force the red shape above the landmass."
    )
    parser.add_argument(
        "--no-clip",
        action="store_true",
        help="Do not mask the highlight to the landmass. Shows an OSM country "
        "boundary as-is, territorial waters included.",
    )
    parser.add_argument(
        "--source",
        choices=("auto", "osm", "natural_earth"),
        default="auto",
        help="Where the shape comes from. Use natural_earth for deserts, "
        "mountain ranges and rainforests -- OSM search resolves those to "
        "unrelated villages.",
    )
    args = parser.parse_args()

    if not args.place and not args.batch:
        parser.error("Give a place, or --batch a file of them.")

    jobs = []
    if args.batch:
        for line in Path(args.batch).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # "place | caption | palette", the last field optional so existing
            # two-column batch files keep working with --palette for all rows.
            place, caption, palette, *_ = [part.strip() for part in line.split("|")] + ["", ""]
            if palette and palette not in PALETTE_NAMES:
                parser.error(f"unknown palette {palette!r} in {args.batch}")
            jobs.append((place, caption, palette or args.palette))
    else:
        jobs.append((args.place, args.caption, args.palette))

    failures = 0
    for place, caption, palette in jobs:
        output = (
            Path(args.output)
            if args.output and len(jobs) == 1
            else Path(args.out_dir) / f"{slugify(place)}.png"
        )
        try:
            generate(place, caption, palette, args, output)
        except (GeoLookupError, RuntimeError) as exc:
            # One bad place name must not abandon the rest of a batch.
            print(f"FAILED {place}: {exc}", file=sys.stderr)
            failures += 1
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
