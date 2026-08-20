"""One call from a motif + a caption to a finished PNG.

The mental card is the geography card with the map taken out: same 1280x720
frame, same grey theme, same tilted caption banner. The figure -- a head, a
brain, or a brain seen through a translucent head -- is composited from
prepared renders (figures.py).

The head is recoloured into the card's palette and is then the one coloured
thing on it, as the filled region is on the map card. The brain is the
exception: it keeps its rendered pink, because that pink is most of what makes
it recognisable as a brain, so on a brain card the palette drives only the
banner.
"""

import hashlib
import io
import logging
import math
import random
from dataclasses import dataclass, replace
from typing import Dict, List, Optional, Tuple

from PIL import Image, ImageOps

from . import figures
from .figures import HEAD, HEAD_GLASS, FigureError
from .fonts import DEFAULT_FAMILY as DEFAULT_FONT
from .render import (
    AUTO_FONT,
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
    resolve_font,
    resolve_palette,
    resolve_theme,
)

logger = logging.getLogger("app.thumbnails.mental")

DEFAULT_WIDTH = 1280
DEFAULT_HEIGHT = 720

# Asking for this angle picks one of the available ones from the subject, the
# way "auto" does for palette and theme.
AUTO_ANGLE = "auto"

# How much of the card the figure may fill, and where it sits sideways.
FIGURE_MAX_WIDTH = 0.58
FIGURE_MAX_HEIGHT = 0.68
FIGURE_CENTER_X = 0.5

# The banner goes under the figure or over it, derived from the subject the way
# the colour is. With one fixed position every card in the feed had the same
# silhouette however the figure, colour and typeface changed.
#
# Each layout is (caption centre, figure centre) as fractions of the height.
# The FIGURE moves out of the banner's way rather than the banner shrinking,
# and the two still overlap slightly either way -- that overlap is what makes
# the banner read as stuck ON the card instead of laid out beside the figure.
#
# The figure centre applies only to a figure that is a complete object with
# space round it -- the brain. A figure whose render is CUT by its own frame
# (the head, whose neck stops because the frame does) is placed by its bottom
# edge instead, because such a cut only passes unnoticed when something covers
# it: see _figure_top.
CAPTION_LAYOUTS: Dict[str, Tuple[float, float]] = {
    "below": (0.755, 0.42),
    "above": (0.225, 0.58),
}
CAPTION_POSITIONS = tuple(CAPTION_LAYOUTS)

# Asking for this position derives one, as "auto" does for palette and theme.
AUTO_CAPTION_POSITION = "auto"

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

# Where the bottom edge of a cut-off figure goes, as a fraction of the card
# height, when the banner is BELOW it: a little past the banner's centre line,
# so the cut ends up inside the banner rather than above it. Placing such a
# figure flush with the card instead put the banner across its face.
FIGURE_BOTTOM_BEHIND_BANNER = 0.03

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
    caption_position: str = CAPTION_POSITIONS[0]
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
    font: str = AUTO_FONT,
    caption_position: str = AUTO_CAPTION_POSITION,
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

    `caption_position` puts the banner "below" the figure or "above" it;
    "auto" derives one from the subject. The figure moves to suit, so the two
    are one layout choice rather than two independent ones.

    `palette`, `theme`, `font`, `uppercase` and `seed` mean exactly what they
    mean on the geography card -- the two share render.py.
    """
    # Resolved from what the AUTHOR wrote, so editing nothing re-renders the
    # same card: the stored filename carries a content hash, and a colour that
    # moved per render would orphan a fresh image in storage every time.
    subject = f"{motif}|{caption}"
    palette = resolve_palette(palette, subject)
    theme = resolve_theme(theme, subject)
    font = resolve_font(font, subject)
    style = style or build_style(palette, theme, font)
    angle = _resolve_angle(angle, motif, subject)

    caption_position = _resolve_caption_position(caption_position, subject)
    caption_center_y, figure_center_y = CAPTION_LAYOUTS[caption_position]
    style = replace(style, caption_center_y=caption_center_y)

    canvas = Image.new("RGB", (width, height), style.ocean)

    figure = figures.compose(
        motif,
        angle,
        (round(width * FIGURE_MAX_WIDTH), round(height * FIGURE_MAX_HEIGHT)),
        _tints(motif, style),
    )
    left = round(width * FIGURE_CENTER_X - figure.width / 2)
    top = _figure_top(
        motif, angle, figure.height, height, caption_position, caption_center_y,
        figure_center_y,
    )

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
        "mental thumbnail rendered: motif=%s angle=%s caption=%s palette=%s "
        "theme=%s font=%s",
        motif,
        angle,
        caption_position,
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
        caption_position=caption_position,
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


def _figure_top(
    motif: str,
    angle: str,
    figure_height: int,
    height: int,
    caption_position: str,
    caption_center_y: float,
    figure_center_y: float,
) -> int:
    """Where the top of the figure goes on the card.

    A figure that is a complete object -- the brain -- is simply centred on the
    layout's figure line.

    A figure CUT by its own render frame is not, because that cut is a straight
    line across a neck and reads as an amputation the moment anything but an
    edge is behind it. It is placed by its BOTTOM instead, somewhere the cut
    cannot be seen: flush with the bottom of the card when the banner is above
    (the card edge does the hiding), and just past the banner's centre line
    when the banner is below (the banner does it). Doing only the first put the
    banner across the face; doing only the second left a head floating with a
    sliced neck once the banner moved up.
    """
    if not figures.bleeds_off_bottom(motif, angle):
        return round(height * figure_center_y - figure_height / 2)
    if caption_position == "below":
        return round(height * (caption_center_y + FIGURE_BOTTOM_BEHIND_BANNER) - figure_height)
    return height - figure_height


def _resolve_caption_position(position: str, subject: str) -> str:
    """Turn a requested banner position (possibly "auto") into a real one."""
    key = (position or AUTO_CAPTION_POSITION).strip().lower()
    if key != AUTO_CAPTION_POSITION:
        if key not in CAPTION_LAYOUTS:
            raise ValueError(
                f"caption_position must be one of {', '.join(CAPTION_POSITIONS)} "
                f"or {AUTO_CAPTION_POSITION}, got {key!r}"
            )
        return key

    # Its own hash prefix, like the theme and the typeface: four derived
    # choices keyed off one string would move in lockstep and produce a
    # fraction of the combinations they can make between them.
    digest = hashlib.sha256(("caption|" + subject.strip().lower()).encode("utf-8")).digest()
    return CAPTION_POSITIONS[digest[0] % len(CAPTION_POSITIONS)]


def _tints(motif: str, style: Style) -> Dict[str, Tuple]:
    """The (shade, light) ramp each layer of `motif` is recoloured onto.

    The brain is never in here. It keeps the pink it was rendered in, because
    that pink is what makes it read as a brain at a glance -- a green or blue
    one is an abstract shape. A layer absent from this mapping is composited
    untouched (see figures.compose), so leaving it out IS the instruction.

    That makes the brain motifs the exception to the card's one-colour rule:
    the palette then only drives the banner. The head has no such natural
    colour, so it still takes the palette and stays the single coloured thing
    on its own card.
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
        return {HEAD_GLASS: shell}
    if motif == "brain":
        return {}
    return {HEAD: coloured}


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
