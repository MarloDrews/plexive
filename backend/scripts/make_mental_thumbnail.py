"""Generate a mental thumbnail from the command line.

The counterpart to make_thumbnail.py, for the figure card instead of the map:

    python backend/scripts/make_mental_thumbnail.py brain_in_head \
        --caption "You edit it every time" -o bias.png

    # Every motif the installed artwork can draw, in every colour, into a
    # folder -- the quickest way to look at a change to the style.
    python backend/scripts/make_mental_thumbnail.py --contact-sheet --out-dir out/

    # What artwork is installed.
    python backend/scripts/make_mental_thumbnail.py --list
"""

import argparse
import re
import sys
from pathlib import Path

# Run as a plain script from anywhere: put backend/ on the import path so
# `app.*` resolves without needing an installed package.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.thumbnails import figures  # noqa: E402
from app.thumbnails.figures import FigureError  # noqa: E402
from app.thumbnails.fonts import FontError  # noqa: E402
from app.thumbnails.mental import (  # noqa: E402
    AUTO_ANGLE,
    AUTO_CAPTION_POSITION,
    CAPTION_POSITIONS,
    render_mental_thumbnail,
)
from app.thumbnails.render import PALETTES, THEMES  # noqa: E402
from app.thumbnails.service import FONT_NAMES, PALETTE_NAMES, THEME_NAMES  # noqa: E402


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "thumbnail"


def describe_assets() -> int:
    """What figures.py found on disk, and what it can therefore draw."""
    print(f"asset directory: {figures.ASSET_ROOT}")
    angles = figures.angle_names()
    if not angles:
        print("  (empty -- see assets/mental/README.md for the layout)")
        return 1
    described = figures.angle_descriptions()
    for angle in angles:
        motifs = ", ".join(figures.motifs_for(angle)) or "nothing (missing layers)"
        note = described.get(angle, "")
        print(f"  {angle}{' -- ' + note if note else ''}")
        print(f"    motifs: {motifs}")
    return 0


def render(motif: str, caption: str, args, output: Path) -> None:
    thumbnail = render_mental_thumbnail(
        motif=motif,
        caption=caption,
        angle=args.angle,
        width=args.width,
        height=args.height,
        uppercase=not args.keep_case,
        palette=args.palette,
        theme=args.theme,
        font=args.font,
        caption_position=args.caption_position,
        seed=args.seed,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(thumbnail.png)
    print(
        f"{output}  motif={thumbnail.motif} angle={thumbnail.angle} "
        f"caption={thumbnail.caption_position} palette={thumbnail.palette} "
        f"theme={thumbnail.theme} font={thumbnail.font}"
    )


def contact_sheet(args) -> int:
    """One card per motif per colour, so a style change can be judged at a
    glance instead of one render at a time."""
    motifs = figures.available_motifs()
    if not motifs:
        print("No motif can be drawn -- the asset directory is empty.", file=sys.stderr)
        return 1

    out_dir = Path(args.out_dir or "mental-sheet")
    for motif in motifs:
        for palette in sorted(PALETTES):
            for theme in sorted(THEMES):
                args.palette, args.theme = palette, theme
                render(
                    motif,
                    args.caption or motif.replace("_", " "),
                    args,
                    out_dir / f"{motif}-{palette}-{theme}.png",
                )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a mental thumbnail card.")
    parser.add_argument(
        "motif",
        nargs="?",
        choices=figures.MOTIF_NAMES,
        help="head, brain or brain_in_head.",
    )
    parser.add_argument("--caption", default="", help="The banner text.")
    parser.add_argument("--angle", default=AUTO_ANGLE, help="Camera angle, or auto.")
    parser.add_argument("--palette", default="auto", choices=PALETTE_NAMES)
    parser.add_argument("--theme", default="auto", choices=THEME_NAMES)
    parser.add_argument("--font", default="auto", choices=FONT_NAMES)
    parser.add_argument(
        "--caption-position",
        default=AUTO_CAPTION_POSITION,
        choices=(AUTO_CAPTION_POSITION,) + CAPTION_POSITIONS,
        help="Put the banner below the figure or above it.",
    )
    parser.add_argument("--seed", type=int, help="Pin the caption's random tilt.")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument(
        "--keep-case", action="store_true", help="Do not capitalise the caption."
    )
    parser.add_argument("-o", "--output", help="Output file for a single render.")
    parser.add_argument("--out-dir", help="Output folder for --contact-sheet.")
    parser.add_argument(
        "--list", action="store_true", help="Show the installed artwork and exit."
    )
    parser.add_argument(
        "--contact-sheet",
        action="store_true",
        help="Render every motif in every colour and theme.",
    )
    args = parser.parse_args()

    try:
        if args.list:
            return describe_assets()
        if args.contact_sheet:
            return contact_sheet(args)
        if not args.motif:
            parser.error("give a motif, or --list / --contact-sheet")

        caption = args.caption or args.motif.replace("_", " ")
        output = Path(args.output or f"{slugify(caption)}.png")
        render(args.motif, caption, args, output)
    except (FigureError, FontError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
