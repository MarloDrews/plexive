"""One call from a motif + a caption to a finished PNG.

The mental card is the geography card with the map taken out: same 1280x720
frame, same grey theme, same tilted caption banner, same rule that exactly one
thing on the card carries colour. Here that one thing is a figure -- a head, a
brain, or a brain seen through a translucent head -- composited from prepared
renders (figures.py) and recoloured into the card's palette.
"""

import hashlib
import io
import logging
import math
import random
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from PIL import Image, ImageOps

from . import figures
from .figures import BRAIN, HEAD, HEAD_GLASS, FigureError
from .fonts import DEFAULT_FAMILY as DEFAULT_FONT
from .render import (
    AUTO_PALETTE,
    AUTO_THEME,
    DEFAULT_PALETTE,
    DEFAULT_THEME,
    Color,
    Style,
    apply_vignette,
    build_style,
    draw_caption,
    fade,
    resolve_palette,
    resolve_theme,
)

logger = logging.getLogger("app.thumbnails.mental")

DEFAULT_WIDTH = 1280
DEFAULT_HEIGHT = 720

# Asking for this angle picks one of the available ones from the subject, the
# way "auto" does for palette and theme.
AUTO_ANGLE = "auto"

# Where the figure sits, as fractions of the card. It fills the upper two
# thirds and is centred sideways; the caption banner (centred at 0.755) then
# overlaps its lower edge, which is what makes the banner read as stuck ON the
# card rather than laid out beside the figure.
FIGURE_MAX_WIDTH = 0.58
FIGURE_MAX_HEIGHT = 0.68
FIGURE_CENTER_X = 0.5
FIGURE_CENTER_Y = 0.42

# How dark and how light the palette colour is pushed to make the figure's
# shading ramp. figures.tint normalises the render's luminance onto this range
# first, so both ends are actually reached: pushing the light end much further
# towards white from here washes the colour out to pastel, and pushing the dark
# end further towards black loses the modelling in the shadows.
FIGURE_SHADE_MIX = 0.55  # towards black
FIGURE_LIGHT_MIX = 0.34  # towards white

# The translucent shell stays neutral even when the brain under it is coloured:
# two coloured layers on one card would break the single-colour rule, and a
# grey shell is also what makes the brain read as being INSIDE something.
SHELL_SHADE_MIX = 0.45  # towards black, from the theme's land grey
SHELL_LIGHT_MIX = 0.85  # towards white

# A soft pool of light behind the figure, so it is not a cutout floating on a
# flat field. Sized against the figure, not the frame.
GLOW_GRID = 64
GLOW_STRENGTH = 0.55
GLOW_SPREAD = 1.35  # times the figure's own size

# The figure's contact shadow, in fractions of the figure height.
FIGURE_SHADOW_BLUR = 0.045
FIGURE_SHADOW_OFFSET = 0.03
FIGURE_SHADOW_OPACITY = 0.55


@dataclass
class MentalThumbnail:
    png: bytes
    width: int
    height: int
    caption_lines: List[str]
    # What was actually drawn. Echoed back for the same reason the geography
    # card reports its matched place: "auto" resolves to something, and the
    # caller should be able to see what without re-deriving the hash.
    motif: str
    angle: str
    palette: str = DEFAULT_PALETTE
    theme: str = DEFAULT_THEME
    font: str = DEFAULT_FONT


def render_mental_thumbnail(
    motif: str,
    caption: str,
    angle: str = AUTO_ANGLE,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    uppercase: bool = True,
    palette: str = AUTO_PALETTE,
    theme: str = AUTO_THEME,
    font: str = DEFAULT_FONT,
    seed: Optional[int] = None,
    style: Optional[Style] = None,
) -> MentalThumbnail:
    """Render a figure on a plain themed field with a caption banner under it.

    `motif` is one of figures.MOTIF_NAMES: "head" for a post about the person,
    "brain" for one about the organ, "brain_in_head" for one about something
    running inside someone who cannot see it.

    `angle` names a camera angle from the asset directory; "auto" picks one
    that can draw the motif, derived from the subject so a card keeps its
    framing across re-renders.

    `palette`, `theme`, `font`, `uppercase` and `seed` mean exactly what they
    mean on the geography card -- the two share render.py.
    """
    # Resolved from what the AUTHOR wrote, so editing nothing re-renders the
    # same card: the stored filename carries a content hash, and a colour that
    # moved per render would orphan a fresh image in storage every time.
    subject = f"{motif}|{caption}"
    palette = resolve_palette(palette, subject)
    theme = resolve_theme(theme, subject)
    style = style or build_style(palette, theme, font)
    angle = _resolve_angle(angle, motif, subject)

    canvas = Image.new("RGB", (width, height), style.ocean)

    figure = figures.compose(
        motif,
        angle,
        (round(width * FIGURE_MAX_WIDTH), round(height * FIGURE_MAX_HEIGHT)),
        _tints(motif, style),
    )
    left = round(width * FIGURE_CENTER_X - figure.width / 2)
    top = round(height * FIGURE_CENTER_Y - figure.height / 2)

    _draw_glow(canvas, figure, (left, top), style)
    _draw_figure_shadow(canvas, figure, (left, top), style)
    canvas.paste(figure, (left, top), figure)

    # Before the caption, so the banner sits on the vignette at full brightness
    # however close to the frame edge it lands -- as on the map card.
    apply_vignette(canvas, style)

    text = caption.upper() if uppercase else caption
    lines, _, _ = draw_caption(canvas, text, style, random.Random(seed))

    buffer = io.BytesIO()
    canvas.save(buffer, format="PNG", optimize=True)
    logger.info(
        "mental thumbnail rendered: motif=%s angle=%s palette=%s theme=%s font=%s",
        motif,
        angle,
        palette,
        theme,
        style.font_family,
    )
    return MentalThumbnail(
        png=buffer.getvalue(),
        width=width,
        height=height,
        caption_lines=lines,
        motif=motif,
        angle=angle,
        palette=palette,
        theme=theme,
        font=style.font_family,
    )


def _resolve_angle(angle: str, motif: str, subject: str) -> str:
    """Turn a requested angle (possibly "auto") into one that can draw `motif`."""
    usable = figures.angles_for(motif)
    if not usable:
        available = ", ".join(figures.available_motifs()) or "none"
        raise FigureError(
            f"no camera angle in {figures.ASSET_ROOT} has the layers for motif "
            f"{motif!r} (motifs that can be drawn: {available})"
        )

    key = (angle or AUTO_ANGLE).strip().lower()
    if key != AUTO_ANGLE:
        if key not in usable:
            raise FigureError(
                f"angle {key!r} cannot draw {motif!r} (angles that can: "
                f"{', '.join(usable)})"
            )
        return key

    # Hashed rather than random, for the same reason as the auto palette: the
    # same spec has to render the same card every time.
    digest = hashlib.sha256(("angle|" + subject.strip().lower()).encode("utf-8")).digest()
    return usable[digest[0] % len(usable)]


def _tints(motif: str, style: Style) -> Dict[str, Tuple]:
    """The (shade, light) ramp each layer of `motif` is recoloured onto.

    The head or the brain takes the palette colour -- whichever of them IS the
    subject. In brain_in_head that is the brain, and the shell over it stays a
    neutral grey so the card still has exactly one coloured thing on it.
    """
    coloured = (
        _mix(style.highlight, (0, 0, 0), FIGURE_SHADE_MIX),
        _mix(style.highlight, (255, 255, 255), FIGURE_LIGHT_MIX),
    )
    # normalize=False: the shell is meant to be washed out, and stretching its
    # luminance would turn the glass into a second solid head.
    shell = (
        _mix(style.land, (0, 0, 0), SHELL_SHADE_MIX),
        _mix(style.land, (255, 255, 255), SHELL_LIGHT_MIX),
        False,
    )
    if motif == "brain_in_head":
        return {BRAIN: coloured, HEAD_GLASS: shell}
    return {HEAD: coloured, BRAIN: coloured}


def _mix(colour: Color, towards: Color, amount: float) -> Color:
    return tuple(
        int(round(channel + (target - channel) * amount))
        for channel, target in zip(colour, towards)
    )


def _draw_glow(
    canvas: Image.Image, figure: Image.Image, position: Tuple[int, int], style: Style
) -> None:
    """A soft pool of the theme's land grey behind the figure, in place.

    Built at GLOW_GRID and stretched, the way the vignette is: it is a smooth
    radial ramp, so a coarse grid interpolates to something identical to a
    full-size one at a fraction of the cost.
    """
    values = []
    for row in range(GLOW_GRID):
        offset_y = (row + 0.5) / GLOW_GRID * 2 - 1
        for column in range(GLOW_GRID):
            offset_x = (column + 0.5) / GLOW_GRID * 2 - 1
            ramp = max(0.0, 1.0 - min(1.0, math.hypot(offset_x, offset_y)))
            values.append(int(255 * GLOW_STRENGTH * ramp * ramp))

    mask = Image.new("L", (GLOW_GRID, GLOW_GRID))
    mask.putdata(values)
    # A one-cell border of zero, so the ramp is guaranteed to reach nothing at
    # the box edge. The squared falloff above already rounds to zero in the
    # outermost cell at the current strength, but a linear ramp or a stronger
    # glow would not, and scaling a residual value up to 500 pixels draws a
    # rectangle around the figure.
    mask = ImageOps.expand(mask, border=1, fill=0)

    box = (round(figure.width * GLOW_SPREAD), round(figure.height * GLOW_SPREAD))
    left = position[0] + figure.width // 2 - box[0] // 2
    top = position[1] + figure.height // 2 - box[1] // 2
    canvas.paste(
        Image.new("RGB", box, style.land), (left, top), mask.resize(box, Image.BICUBIC)
    )


def _draw_figure_shadow(
    canvas: Image.Image, figure: Image.Image, position: Tuple[int, int], style: Style
) -> None:
    """A blurred copy of the figure's own silhouette, dropped below it.

    Taken from the finished silhouette rather than guessed at, exactly as the
    banner's halo is -- it is what stops the figure looking pasted on.
    """
    blur = figure.height * FIGURE_SHADOW_BLUR
    # The figure touches all four edges of its own bounding box by definition,
    # so blurring its silhouette in place clips the shadow off square. Pad
    # first, blur into the padding, and shift the paste back by the same
    # amount.
    margin = round(3 * blur) + 2
    silhouette = ImageOps.expand(figure.getchannel("A"), border=margin, fill=0)
    mask = fade(silhouette, blur, style.shadow_opacity * FIGURE_SHADOW_OPACITY)
    drop = round(figure.height * FIGURE_SHADOW_OFFSET)
    canvas.paste(
        Image.new("RGB", silhouette.size, style.shadow),
        (position[0] - margin, position[1] - margin + drop),
        mask,
    )
