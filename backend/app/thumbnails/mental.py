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
import random
from dataclasses import dataclass, replace
from typing import Dict, List, Optional, Tuple

from PIL import Image

from . import figures
from .figures import HEAD, HEAD_GLASS, FigureError
from .fonts import DEFAULT_FAMILY as DEFAULT_FONT
from .render import (
    AUTO_CAPTION_POSITION,
    AUTO_FONT,
    AUTO_PALETTE,
    AUTO_THEME,
    CAPTION_LAYOUTS,
    CAPTION_POSITIONS,
    DEFAULT_PALETTE,
    DEFAULT_THEME,
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

# Re-exported: CAPTION_LAYOUTS, CAPTION_POSITIONS and AUTO_CAPTION_POSITION
# moved to render.py when the concept card started sharing them, and the CLI
# and tests import them from here.
__all__ = [
    "AUTO_ANGLE",
    "AUTO_CAPTION_POSITION",
    "CAPTION_LAYOUTS",
    "CAPTION_POSITIONS",
    "MentalThumbnail",
    "render_mental_thumbnail",
]

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

# The layout's figure centre (see render.CAPTION_LAYOUTS) applies only to a
# figure that is a complete object with space round it -- the brain. A figure
# whose render is CUT by its own frame (the head, whose neck stops because the
# frame does) is placed by its bottom edge instead, because such a cut only
# passes unnoticed when something covers it: see _figure_top.

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

# Where the bottom edge of a cut-off figure goes, as a fraction of the card
# height, when the banner is BELOW it: a little past the banner's centre line,
# so the cut ends up inside the banner rather than above it. Placing such a
# figure flush with the card instead put the banner across its face.
FIGURE_BOTTOM_BEHIND_BANNER = 0.03


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
    mirrored: bool = False
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
    mirror: Optional[bool] = None,
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

    `mirror` turns the figure left-to-right; None rolls for it, which is what
    makes about half the side-on cards in a feed look the other way. It is the
    one choice on the card that is not derived from the subject -- see
    _resolve_mirror -- so `seed` is what pins it.

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

    # One generator for the whole card, so seed= pins everything random on it:
    # the flip below and the caption's tilt further down.
    rng = random.Random(seed)
    mirrored = _resolve_mirror(mirror, angle, rng)

    caption_position = resolve_caption_position(caption_position, subject)
    caption_center_y, figure_center_y = CAPTION_LAYOUTS[caption_position]
    style = replace(style, caption_center_y=caption_center_y)

    canvas = Image.new("RGB", (width, height), style.ocean)

    figure = figures.compose(
        motif,
        angle,
        (round(width * FIGURE_MAX_WIDTH), round(height * FIGURE_MAX_HEIGHT)),
        _tints(motif, style),
        mirrored,
    )
    left = round(width * FIGURE_CENTER_X - figure.width / 2)
    top = _figure_top(
        motif, angle, figure.height, height, caption_position, caption_center_y,
        figure_center_y,
    )

    draw_glow(canvas, figure, (left, top), style)
    draw_layer_shadow(canvas, figure, (left, top), style)
    canvas.paste(figure, (left, top), figure)

    # Before the caption, so the banner sits on the vignette at full brightness
    # however close to the frame edge it lands -- as on the map card.
    apply_vignette(canvas, style)

    text = caption.upper() if uppercase else caption
    lines, _, _ = draw_caption(canvas, text, style, rng)

    buffer = io.BytesIO()
    canvas.save(buffer, format="PNG", optimize=True)
    logger.info(
        "mental thumbnail rendered: motif=%s angle=%s mirrored=%s caption=%s "
        "palette=%s theme=%s font=%s",
        motif,
        angle,
        mirrored,
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
        mirrored=mirrored,
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


def _resolve_mirror(mirror: Optional[bool], angle: str, rng: random.Random) -> bool:
    """Whether to turn the figure left-to-right. None means roll for it.

    There is one render per camera angle, so without this every side-on card in
    the feed has the head facing the same way, and a column of them reads as
    the same picture repeated however the colour, typeface and banner move. A
    flip is the cheapest variation available: no second render to keep in step,
    and nothing on the figure is handed or lettered, so a mirrored head is
    simply a head looking the other way.

    This is the one choice on the card that is genuinely random instead of
    derived from the subject. Deriving it measured a clean 50/50 across four
    thousand subjects and still left all seven side-on cards in a real 14-post
    feed facing the same way -- a fair coin does land seven heads once in
    sixty-four runs, and a hash has no memory of the run it belongs to. Rolling
    does not make that impossible either, but it does mean a bad run is not
    baked in: rendering again deals a new hand, where a hash would return the
    same one forever.

    The cost is that a re-render no longer reproduces the same file. Nothing is
    lost in normal use -- generate_thumbnails.py only renders a post whose
    thumbnail_url is empty -- but a --force run now writes a new object per card
    rather than overwriting the old one, leaving the previous images behind in
    storage. Pass `seed` where that matters.
    """
    if mirror is not None:
        return mirror
    # A head-on camera is its own mirror image; see figures.faces_sideways.
    # Flipping one is invisible and still costs a second file in storage.
    if not figures.faces_sideways(angle):
        return False
    return rng.random() < 0.5


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
