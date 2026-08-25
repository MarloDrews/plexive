"""One call from a proportion or a formula to a finished PNG.

The third card. The map says WHERE a claim is true and the figure card says
WHOSE MIND it happens in; this one is for a claim that is neither -- one whose
substance is a share of a whole (8% of your DNA is old virus) or a rule that can
be written down (the twelfth root of two).

Two slots, and the composition changes with both:

    content   a 100-dot grid (`share`) or typeset maths (`formula`)
    portrait  optional, to the right -- the person the claim hangs on

With no portrait the content is centred; with one the card splits in two. That
is deliberate and is most of why this generator exists in this shape: a card
whose picture is always the same shape makes a monotonous feed, and four
silhouettes out of one generator is what a single big number could never give.

Everything else -- palette, theme, typeface, banner position, the tilted banner
itself -- is the shared card furniture from render.py, so this card is a sibling
of the other two rather than a new look.
"""

import io
import logging
import random
from dataclasses import dataclass, replace
from typing import Dict, List, Optional, Tuple

from PIL import Image, ImageDraw

from . import figures
from .fonts import DEFAULT_FAMILY as DEFAULT_FONT
from .formula import render_formula
from .render import (
    AUTO_CAPTION_POSITION,
    AUTO_FONT,
    AUTO_PALETTE,
    AUTO_THEME,
    CAPTION_LAYOUTS,
    DEFAULT_PALETTE,
    DEFAULT_THEME,
    SUPERSAMPLE,
    Color,
    Style,
    apply_vignette,
    build_style,
    draw_caption,
    draw_glow,
    draw_layer_shadow,
    resolve_caption_position,
    resolve_font,
    resolve_palette,
    resolve_theme,
)
from .wikimedia import Portrait, PortraitLookupError, lookup_portrait

logger = logging.getLogger("app.thumbnails.concept")

DEFAULT_WIDTH = 1280
DEFAULT_HEIGHT = 720

# What the content slot is showing. Derived from which of share/formula was
# given rather than asked for separately -- see generators.CONCEPT.
DOTS = "dots"
FORMULA = "formula"

# The grid is always a hundred dots, because a hundred is the only count a
# reader can convert to a percentage without counting. `columns` shapes it;
# it does not change the total.
DOT_TOTAL = 100
DEFAULT_COLUMNS = 10

# Spacing between dots, as a fraction of a dot's diameter.
DOT_GAP = 0.45

# How thick the ring of a benchmark dot is, as a fraction of the diameter.
#
# A benchmark dot is the same size and colour as its neighbours but HOLLOW,
# rather than a solid dot with a smaller circle drawn inside it. The inner
# circle was tried first and reads as a target or a bullseye -- something is
# wrong with those dots -- where a hollow one reads as an outline round a group,
# which is what a benchmark is. Thick enough that the ring survives being
# scaled down to a 30-pixel dot.
BENCHMARK_RING = 0.26

# Where the content sits and how tall it may be, per banner position, as
# fractions of the card height.
#
# This card does NOT reuse the figure centres from render.CAPTION_LAYOUTS, and
# the reason is not taste. On the figure card the banner is meant to overlap the
# head slightly -- that overlap is what makes it read as stuck ON the card. Here
# it would cover dots, and a covered dot is not a cosmetic problem: the grid IS
# the claim, so hiding part of it makes the card state a different proportion
# than the post does. So the content clears the banner entirely and takes the
# middle of whatever room is left, which is also more room than the figure
# layout would have given it.
#
# Derived by taking the banner's own centre from render.CAPTION_LAYOUTS, adding
# about 0.12 either side for half a banner plus the tilt and a little air, and
# centring the content in the rest of the card.
CONTENT_LAYOUTS: Dict[str, Tuple[float, float]] = {
    "below": (0.33, 0.60),
    "above": (0.66, 0.62),
}

# Centred layout: how much of the card's WIDTH the content may fill.
#
# The two slots get different budgets because they are different shapes. The
# grid is square, so its width is never what limits it -- the height is, and a
# wider budget would change nothing. A formula is a wide, flat thing whose
# height is set by its width, so the same 0.58 left it visibly undersized with
# empty card on both sides. It still stays inside the caption's own 0.82.
CONTENT_MAX_WIDTH = 0.58
FORMULA_MAX_WIDTH = 0.74
CONTENT_CENTER_X = 0.5

# Split layout. The content keeps the larger half -- it is the substance of the
# card, and the portrait is an attribution, not the subject.
SPLIT_CONTENT_MAX_WIDTH = 0.44
SPLIT_CONTENT_CENTER_X = 0.35
PORTRAIT_MAX_WIDTH = 0.26
PORTRAIT_CENTER_X = 0.775
# The portrait is an attribution beside the claim, not a second subject, so it
# stays a little shorter than the content it stands next to.
PORTRAIT_HEIGHT_SHARE = 0.92

# How dark and how light the palette colour is pushed to make the portrait's
# shading ramp. The same numbers the head is recoloured with in mental.py: a
# duotone portrait is what stops a photograph reading as a foreign object
# pasted onto a flat graphic card.
PORTRAIT_SHADE_MIX = 0.55  # towards black
PORTRAIT_LIGHT_MIX = 0.34  # towards white

# Where the square crop is taken from a taller-than-wide portrait, as a
# fraction of the spare height. Faces sit high in a portrait, so a centred
# square crops the forehead and keeps the chest.
PORTRAIT_CROP_TOP = 0.15


@dataclass
class ConceptThumbnail:
    """The finished card, plus what "auto" and the portrait lookup resolved to."""

    png: bytes
    width: int
    height: int
    caption_lines: List[str]
    # "dots" or "formula".
    content: str
    filled_dots: Optional[int] = None
    benchmark_dots: Optional[int] = None
    # The Commons file actually drawn, or None. Echoed back for the same reason
    # the map card reports its matched place: the caller should be able to see
    # what a name resolved to without repeating the lookup.
    portrait_file: Optional[str] = None
    portrait_license: str = ""
    portrait_artist: str = ""
    portrait_credit_url: str = ""
    # Why a requested portrait was not drawn. Empty when none was asked for or
    # when one was drawn -- a batch run reports these at the end.
    portrait_skipped: str = ""
    caption_position: str = "below"
    palette: str = DEFAULT_PALETTE
    theme: str = DEFAULT_THEME
    font: str = DEFAULT_FONT


def render_concept_thumbnail(
    caption: str,
    share: Optional[float] = None,
    formula: Optional[str] = None,
    benchmark: Optional[float] = None,
    portrait: Optional[str] = None,
    portrait_file: Optional[str] = None,
    columns: int = DEFAULT_COLUMNS,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    uppercase: bool = True,
    palette: str = AUTO_PALETTE,
    theme: str = AUTO_THEME,
    font: str = AUTO_FONT,
    caption_position: str = AUTO_CAPTION_POSITION,
    seed: Optional[int] = None,
    use_cache: bool = True,
    style: Optional[Style] = None,
) -> ConceptThumbnail:
    """Render a proportion or a formula, optionally beside a portrait.

    Exactly one of `share` (0-100) and `formula` (LaTeX maths, no dollar signs)
    carries the card. `benchmark` is a second share the post explicitly compares
    the first with, drawn as a ring rather than a second colour so the card
    keeps to one.

    `portrait` is a PERSON's name, looked up on Wikipedia; `portrait_file` pins
    a Commons File: instead, for a name that resolves to the wrong image. A
    portrait that cannot be resolved, or whose licence or shape the lookup
    refuses, is DROPPED and the card comes out centred -- the reason lands on
    the result as `portrait_skipped`.

    `palette`, `theme`, `font`, `uppercase`, `caption_position` and `seed` mean
    exactly what they mean on the other two cards -- all three share render.py.
    """
    if (share is None) == (formula is None):
        raise ValueError("give exactly one of share= or formula=")
    if share is not None and not 0 <= share <= 100:
        raise ValueError(f"share must be between 0 and 100, got {share!r}")
    if benchmark is not None:
        if formula is not None:
            raise ValueError("benchmark= belongs to a share card, not a formula one")
        if not 0 <= benchmark <= 100:
            raise ValueError(f"benchmark must be between 0 and 100, got {benchmark!r}")

    content = DOTS if share is not None else FORMULA

    # Resolved from what the AUTHOR wrote, so editing nothing re-renders the
    # same card: the stored filename carries a content hash, and a colour that
    # moved per render would orphan a fresh image in storage every time.
    subject = f"{share if share is not None else formula}|{caption}"
    palette = resolve_palette(palette, subject)
    theme = resolve_theme(theme, subject)
    font = resolve_font(font, subject)
    style = style or build_style(palette, theme, font)

    caption_position = resolve_caption_position(caption_position, subject)
    caption_center_y = CAPTION_LAYOUTS[caption_position][0]
    content_center_y, content_max_height = CONTENT_LAYOUTS[caption_position]
    style = replace(style, caption_center_y=caption_center_y)

    resolved, skipped = _resolve_portrait(portrait, portrait_file, use_cache)

    canvas = Image.new("RGB", (width, height), style.ocean)

    # The LAYOUT follows the resolved portrait, not the parameter: a portrait
    # that was asked for and refused has to leave a centred card, not a hole.
    split = resolved is not None
    if split:
        # Split in two, the content keeps the same half whatever shape it is.
        content_width = SPLIT_CONTENT_MAX_WIDTH
        content_center_x = SPLIT_CONTENT_CENTER_X
    else:
        content_width = CONTENT_MAX_WIDTH if content == DOTS else FORMULA_MAX_WIDTH
        content_center_x = CONTENT_CENTER_X
    content_box = (round(width * content_width), round(height * content_max_height))

    if content == DOTS:
        layer, filled, ringed = _draw_dots(share, benchmark, columns, content_box, style)
    else:
        layer, filled, ringed = _draw_formula(formula, content_box, style)

    _place(canvas, layer, content_center_x, content_center_y, width, height, style)

    if resolved is not None:
        portrait_layer = _draw_portrait(
            resolved,
            (
                round(width * PORTRAIT_MAX_WIDTH),
                round(height * content_max_height * PORTRAIT_HEIGHT_SHARE),
            ),
            style,
        )
        _place(
            canvas, portrait_layer, PORTRAIT_CENTER_X, content_center_y, width, height, style
        )

    # Before the caption, so the banner sits on the vignette at full brightness
    # however close to the frame edge it lands -- as on the other two cards.
    apply_vignette(canvas, style)

    text = caption.upper() if uppercase else caption
    lines, _, _ = draw_caption(canvas, text, style, random.Random(seed))

    buffer = io.BytesIO()
    canvas.save(buffer, format="PNG", optimize=True)
    logger.info(
        "concept thumbnail rendered: content=%s filled=%s portrait=%s caption=%s "
        "palette=%s theme=%s font=%s",
        content,
        filled,
        resolved.file if resolved else (skipped or "none"),
        caption_position,
        palette,
        theme,
        style.font_family,
    )
    return ConceptThumbnail(
        png=buffer.getvalue(),
        width=width,
        height=height,
        caption_lines=lines,
        content=content,
        filled_dots=filled,
        benchmark_dots=ringed,
        portrait_file=resolved.file if resolved else None,
        portrait_license=resolved.license if resolved else "",
        portrait_artist=resolved.artist if resolved else "",
        portrait_credit_url=resolved.credit_url if resolved else "",
        portrait_skipped=skipped,
        caption_position=caption_position,
        palette=palette,
        theme=theme,
        font=style.font_family,
    )


def _resolve_portrait(
    portrait: Optional[str], portrait_file: Optional[str], use_cache: bool
) -> Tuple[Optional[Portrait], str]:
    """Look a portrait up, or explain why the card will not have one.

    Never raises. A portrait is the one part of this card that depends on a
    third party being reachable and on a licence being the right one, and
    neither is a reason to leave a post with no thumbnail at all.
    """
    if not (portrait or portrait_file):
        return None, ""
    try:
        return lookup_portrait(portrait, portrait_file, use_cache=use_cache), ""
    except PortraitLookupError as exc:
        logger.warning("no portrait for %r: %s", portrait or portrait_file, exc)
        return None, str(exc)


def _place(
    canvas: Image.Image,
    layer: Image.Image,
    center_x: float,
    center_y: float,
    width: int,
    height: int,
    style: Style,
) -> None:
    """Set one finished RGBA layer on the card, with its glow and shadow.

    Both slots are complete objects with space around them -- unlike the figure
    card's head, nothing here is cut off by its own frame -- so both are simply
    centred on the layout's content line.
    """
    left = round(width * center_x - layer.width / 2)
    top = round(height * center_y - layer.height / 2)
    draw_glow(canvas, layer, (left, top), style)
    draw_layer_shadow(canvas, layer, (left, top), style)
    canvas.paste(layer, (left, top), layer)


def dots_for(share: float) -> int:
    """How many of the hundred dots a share fills.

    Rounded to the nearest dot, but never all the way to either end while the
    share itself is not: 99.9% drawn as a full grid says "all of them", which is
    exactly the thing the post is correcting, and the one empty dot is the whole
    picture. The same in reverse for a share too small to round up to one.
    """
    filled = int(round(share * DOT_TOTAL / 100))
    if share > 0:
        filled = max(1, filled)
    if share < 100:
        filled = min(DOT_TOTAL - 1, filled)
    return filled


def _draw_dots(
    share: float,
    benchmark: Optional[float],
    columns: int,
    box: Tuple[int, int],
    style: Style,
) -> Tuple[Image.Image, int, Optional[int]]:
    """The hundred-dot grid as its own RGBA layer.

    Drawn supersampled and scaled down for the same reason the map is: Pillow's
    ellipse has no antialiasing, and a hundred hard-edged circles look like a
    printing fault.
    """
    if columns < 1 or DOT_TOTAL % columns:
        raise ValueError(
            f"columns must divide {DOT_TOTAL} exactly, got {columns!r}"
        )
    rows = DOT_TOTAL // columns
    filled = dots_for(share)
    ringed = dots_for(benchmark) if benchmark is not None else None

    # Fit a dot diameter to whichever axis runs out first, then build the layer
    # at exactly the size the grid needs rather than the size of the box.
    span_x = columns + (columns - 1) * DOT_GAP
    span_y = rows + (rows - 1) * DOT_GAP
    diameter = min(box[0] / span_x, box[1] / span_y) * SUPERSAMPLE
    step = diameter * (1 + DOT_GAP)

    layer = Image.new(
        "RGBA",
        (round(span_x * diameter), round(span_y * diameter)),
        (0, 0, 0, 0),
    )
    draw = ImageDraw.Draw(layer)
    inset = diameter * BENCHMARK_RING

    for index in range(DOT_TOTAL):
        left = (index % columns) * step
        top = (index // columns) * step
        colour = style.highlight if index < filled else style.land
        draw.ellipse((left, top, left + diameter, top + diameter), fill=colour + (255,))

        if ringed is not None and index < ringed:
            # Punched fully transparent rather than filled with the background
            # colour: the card puts a soft pool of light behind this layer, so a
            # hole painted in flat background would show up as a dull disc
            # against it. Drawing on an RGBA image writes raw values, so this
            # really does erase.
            draw.ellipse(
                (left + inset, top + inset, left + diameter - inset, top + diameter - inset),
                fill=(0, 0, 0, 0),
            )

    scaled = (max(1, layer.width // SUPERSAMPLE), max(1, layer.height // SUPERSAMPLE))
    return layer.resize(scaled, Image.LANCZOS), filled, ringed


def _draw_formula(
    latex: str, box: Tuple[int, int], style: Style
) -> Tuple[Image.Image, None, None]:
    """The typeset formula as its own RGBA layer, in the card's colour.

    formula.py returns it white on transparent; the colour is pasted through
    that alpha here, so what colour a formula is stays a card decision.
    """
    typeset = render_formula(latex, style.font_family)
    coloured = Image.new("RGBA", typeset.size, style.highlight + (255,))
    coloured.putalpha(typeset.getchannel("A"))
    return figures.fit(coloured, box), None, None


def _draw_portrait(
    portrait: Portrait, box: Tuple[int, int], style: Style
) -> Image.Image:
    """The portrait: cropped square, duotoned into the palette, masked to a circle.

    Duotone rather than the original photograph, through the same figures.tint
    the head goes through: it is what makes a Wikipedia scan sit on the card
    instead of on top of it, and it makes the source's exposure and colour cast
    stop mattering.
    """
    with Image.open(portrait.path) as opened:
        opened.load()
        image = opened.convert("RGBA")

    image = _square(image)
    size = min(box)
    image = image.resize((size, size), Image.LANCZOS)

    image = figures.tint(
        image,
        _mix(style.highlight, (0, 0, 0), PORTRAIT_SHADE_MIX),
        _mix(style.highlight, (255, 255, 255), PORTRAIT_LIGHT_MIX),
    )

    # Built at SUPERSAMPLE and scaled down: an ellipse mask has the same
    # aliasing problem the dots do, and a stair-stepped circle is obvious.
    mask = Image.new("L", (size * SUPERSAMPLE, size * SUPERSAMPLE), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, mask.width - 1, mask.height - 1), fill=255)
    image.putalpha(mask.resize((size, size), Image.LANCZOS))
    return image


def _square(image: Image.Image) -> Image.Image:
    """The squarest crop of a portrait that keeps the face.

    Horizontally centred, but vertically taken from near the TOP: a face sits
    high in a portrait, so a centred square on a full-length photograph crops
    the head off and keeps the coat.
    """
    side = min(image.size)
    left = (image.width - side) // 2
    top = round((image.height - side) * PORTRAIT_CROP_TOP)
    return image.crop((left, top, left + side, top + side))


def _mix(colour: Color, towards: Color, amount: float) -> Color:
    return tuple(
        int(round(channel + (target - channel) * amount))
        for channel, target in zip(colour, towards)
    )
