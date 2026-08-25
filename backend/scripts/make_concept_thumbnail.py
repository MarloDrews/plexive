"""Generate a concept thumbnail from the command line.

The third of the make_*_thumbnail scripts, for the proportion/formula card:

    # A share of a whole.
    python backend/scripts/make_concept_thumbnail.py --share 80 \
        --caption "Most of it goes up" -o vagus.png

    # A rule, typeset as maths (no dollar signs).
    python backend/scripts/make_concept_thumbnail.py --formula "\\sqrt[12]{2}" \
        --caption "Every piano is out of tune" -o piano.png

    # Beside the person it belongs to, looked up on Wikipedia.
    python backend/scripts/make_concept_thumbnail.py --formula "R=e^{-t/S}" \
        --portrait "Hermann Ebbinghaus" --caption "Memory fades on a curve"

    # Every colour and theme, centred and split, into a folder -- the quickest
    # way to look at a change to the style.
    python backend/scripts/make_concept_thumbnail.py --contact-sheet --out-dir out/
"""

import argparse
import re
import sys
from pathlib import Path

# Run as a plain script from anywhere: put backend/ on the import path so
# `app.*` resolves without needing an installed package.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.thumbnails.concept import render_concept_thumbnail  # noqa: E402
from app.thumbnails.fonts import FontError  # noqa: E402
from app.thumbnails.formula import FormulaError  # noqa: E402
from app.thumbnails.render import (  # noqa: E402
    AUTO_CAPTION_POSITION,
    CAPTION_POSITIONS,
    PALETTES,
    THEMES,
)
from app.thumbnails.service import FONT_NAMES, PALETTE_NAMES, THEME_NAMES  # noqa: E402


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "thumbnail"


def render(args, output: Path, **overrides) -> None:
    settings = dict(
        caption=args.caption,
        share=args.share,
        formula=args.formula,
        benchmark=args.benchmark,
        portrait=args.portrait,
        portrait_file=args.portrait_file,
        columns=args.columns,
        width=args.width,
        height=args.height,
        uppercase=not args.keep_case,
        palette=args.palette,
        theme=args.theme,
        font=args.font,
        caption_position=args.caption_position,
        seed=args.seed,
        use_cache=not args.no_cache,
    )
    settings.update(overrides)

    thumbnail = render_concept_thumbnail(**settings)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(thumbnail.png)

    where = (
        f"portrait={thumbnail.portrait_file}"
        if thumbnail.portrait_file
        else "portrait=none"
    )
    print(
        f"{output}  content={thumbnail.content} filled={thumbnail.filled_dots} "
        f"{where} caption={thumbnail.caption_position} "
        f"palette={thumbnail.palette} theme={thumbnail.theme} font={thumbnail.font}"
    )
    if thumbnail.portrait_skipped:
        # Not an error: the card rendered centred instead. Still worth saying,
        # because the reason is usually a licence and always actionable.
        print(f"  portrait dropped: {thumbnail.portrait_skipped}", file=sys.stderr)
    elif thumbnail.portrait_file:
        print(
            f"  {thumbnail.portrait_license}"
            + (f", {thumbnail.portrait_artist}" if thumbnail.portrait_artist else "")
            + (f" -- {thumbnail.portrait_credit_url}" if thumbnail.portrait_credit_url else "")
        )


def contact_sheet(args) -> int:
    """Every colour and theme, in both layouts and across the range of shares.

    A style change is judged here rather than one render at a time: the point of
    this card is that its picture changes with its content, and that is only
    visible side by side.
    """
    out_dir = Path(args.out_dir or "concept-sheet")

    # A low, a middling and a high share plus a formula: the four pictures the
    # content slot can produce.
    contents = [
        ("share-08", {"share": 8, "formula": None}),
        ("share-50", {"share": 50, "formula": None}),
        ("share-99", {"share": 99.9, "formula": None}),
        ("benchmark", {"share": 30, "benchmark": 11, "formula": None}),
        ("formula", {"share": None, "formula": r"P(d)=\log_{10}(1+1/d)"}),
    ]

    for name, content in contents:
        for palette in sorted(PALETTES):
            for theme in sorted(THEMES):
                render(
                    args,
                    out_dir / f"{name}-{palette}-{theme}.png",
                    palette=palette,
                    theme=theme,
                    **content,
                )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a concept thumbnail card.")
    parser.add_argument(
        "--share",
        type=float,
        help="The percentage to fill in the hundred-dot grid, 0-100.",
    )
    parser.add_argument(
        "--formula",
        help="LaTeX maths WITHOUT dollar signs, drawn instead of the grid.",
    )
    parser.add_argument(
        "--benchmark",
        type=float,
        help="A second share, drawn as hollow dots inside the filled ones.",
    )
    parser.add_argument("--caption", default="", help="The banner text.")
    parser.add_argument(
        "--portrait",
        help="A PERSON's name to look up on Wikipedia, e.g. \"Hermann Ebbinghaus\".",
    )
    parser.add_argument(
        "--portrait-file",
        help='A pinned Commons file, e.g. "File:Ebbinghaus2.jpg".',
    )
    parser.add_argument(
        "--columns", type=int, default=10, help="Dots per row; must divide 100."
    )
    parser.add_argument("--palette", default="auto", choices=PALETTE_NAMES)
    parser.add_argument("--theme", default="auto", choices=THEME_NAMES)
    parser.add_argument("--font", default="auto", choices=FONT_NAMES)
    parser.add_argument(
        "--caption-position",
        default=AUTO_CAPTION_POSITION,
        choices=(AUTO_CAPTION_POSITION,) + CAPTION_POSITIONS,
        help="Put the banner below the content or above it.",
    )
    parser.add_argument("--seed", type=int, help="Pin the caption's random tilt.")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument(
        "--keep-case", action="store_true", help="Do not capitalise the caption."
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Re-query Wikipedia instead of using the cached portrait.",
    )
    parser.add_argument("-o", "--output", help="Output file for a single render.")
    parser.add_argument("--out-dir", help="Output folder for --contact-sheet.")
    parser.add_argument(
        "--contact-sheet",
        action="store_true",
        help="Render every content type in every colour and theme.",
    )
    args = parser.parse_args()

    try:
        if args.contact_sheet:
            return contact_sheet(args)
        if (args.share is None) == (args.formula is None):
            parser.error("give exactly one of --share or --formula")
        if not args.caption:
            parser.error("--caption is required")

        output = Path(args.output or f"{slugify(args.caption)}.png")
        render(args, output)
    except (FormulaError, FontError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
