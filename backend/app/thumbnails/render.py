"""Drawing the thumbnail with Pillow.

The map is drawn at SUPERSAMPLE times the final size and scaled down, because
Pillow's polygon and line drawing has no antialiasing -- coastlines would come
out visibly jagged at 1280x720. The caption is drawn afterwards at the final
size instead, since FreeType antialiases text itself and downscaling it only
makes it softer.
"""

import io
import math
import random
from dataclasses import dataclass, field, replace
from typing import Dict, List, Optional, Sequence, Tuple

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from .fonts import load_font
from .geometry import Polygon
from .projection import Viewport

SUPERSAMPLE = 2

# Minimum spacing between consecutive vertices, in supersampled pixels. Detail
# finer than this cannot survive the downscale, so dropping it changes nothing
# visible while bounding the work: Russia arrives from OSM as 168k points and
# draws as a few thousand. Applied in pixel space on purpose -- the tolerance
# then follows the zoom automatically, which a degree-based tolerance at the
# API cannot do (see nominatim.POLYGON_THRESHOLD).
MIN_VERTEX_SPACING = 0.5

# Rings shorter than this are drawn as-is. Small islands are only a few pixels
# across, and simplifying them risks collapsing them out of the map entirely.
SIMPLIFY_MIN_POINTS = 64

Color = Tuple[int, int, int]


@dataclass(frozen=True)
class Palette:
    """The coloured half of the card: the marked region and its banner.

    Everything else (ocean, land, borders) stays grey in every profile -- the
    whole point of the style is that exactly one thing on the card has colour.
    """

    # The marked region. Drawn as a flat fill with no outline: the greys around
    # it are dark enough that the shape reads on its own.
    highlight: Color
    # The caption banner, same colour as the region so the two read as one.
    banner: Color
    # Caption text. Kept flat and unoutlined -- the banner's halo is what
    # separates the whole block from the region behind it, so the letters
    # themselves only ever sit on the banner and need no help.
    text: Color


PALETTES: Dict[str, Palette] = {
    "red": Palette(
        highlight=(226, 6, 19),
        banner=(226, 6, 19),
        text=(255, 255, 255),
    ),
    "blue": Palette(
        highlight=(10, 86, 204),
        banner=(10, 86, 204),
        text=(255, 255, 255),
    ),
    "green": Palette(
        highlight=(12, 146, 70),
        banner=(12, 146, 70),
        text=(255, 255, 255),
    ),
    # Yellow is far too light for white text, so this profile flips it to near
    # black letters instead.
    "yellow": Palette(
        highlight=(250, 190, 10),
        banner=(250, 190, 10),
        text=(38, 26, 0),
    ),
}

DEFAULT_PALETTE = "red"


class PaletteError(ValueError):
    """An unknown colour profile was asked for."""


@dataclass
class Style:
    """Every colour and proportion of the card, in one place."""

    # The greys are deliberately muted: the marked region carries the card, and
    # a bright basemap competes with it. Kept as one family so the map still
    # reads as a map rather than as a silhouette.
    ocean: Color = (110, 113, 117)
    land: Color = (168, 170, 173)
    # Internal (state/province) borders: barely darker than the land, so they
    # read as texture rather than as content.
    border: Color = (146, 148, 151)
    coast: Color = (94, 97, 101)
    highlight: Color = (226, 6, 19)
    banner: Color = (226, 6, 19)
    text: Color = (255, 255, 255)
    shadow: Color = (0, 0, 0)

    border_width: float = 1.0
    coast_width: float = 1.4

    # Caption geometry, all as fractions of the canvas.
    caption_center_y: float = 0.755
    caption_max_width: float = 0.82
    caption_max_line_height: float = 0.135
    caption_padding_x: float = 0.30  # times the font size
    caption_padding_y: float = 0.22  # times the font size
    caption_line_spacing: float = 0.18  # times the font size

    # Vignette over the map only -- the caption is drawn on top of it, so the
    # banner never dims however close to the edge it lands.
    vignette_strength: float = 0.38  # darkening at the corners, 0 disables
    vignette_inner: float = 0.20  # fraction of the radius left untouched

    # Banner shadow. grow widens the silhouette before blurring, which turns
    # the drop shadow into a halo -- that halo is what separates the banner
    # from the marked region when the two are the same colour and a plain
    # downward offset would leave the upper edge invisible.
    shadow_grow: float = 0.09  # times the font size
    shadow_blur: float = 0.34  # times the font size, the wide ambient pass
    shadow_contact: float = 0.3  # times shadow_blur, the tight contact pass
    shadow_offset_y: float = 0.14  # times the font size
    shadow_opacity: float = 0.5

    # Hand-placed look: a small random tilt and sideways nudge per render.
    caption_max_angle: float = 2.2  # degrees, either way
    caption_jitter_x: float = 0.03  # fraction of the width, either way


def style_for_palette(name: Optional[str] = None, base: Optional[Style] = None) -> Style:
    """A Style with the colour profile `name` applied (grey parts untouched)."""
    key = (name or DEFAULT_PALETTE).strip().lower()
    palette = PALETTES.get(key)
    if palette is None:
        raise PaletteError(f"palette must be one of {', '.join(sorted(PALETTES))}.")
    return replace(
        base or Style(),
        highlight=palette.highlight,
        banner=palette.banner,
        text=palette.text,
    )


@dataclass
class RenderResult:
    png: bytes
    width: int
    height: int
    caption_lines: List[str] = field(default_factory=list)
    # The tilt and sideways nudge actually used, so a caller that liked one
    # render can reproduce it (via the seed) or report it.
    caption_angle: float = 0.0
    caption_offset_x: float = 0.0


def _clamp_points(
    points: Sequence[Tuple[float, float]], width: int, height: int
) -> List[Tuple[float, float]]:
    """Keep coordinates near the canvas.

    A polygon projected from far outside the viewport can land millions of
    pixels away, which Pillow will happily spend real time rasterizing. Pulling
    stray vertices to a generous margin costs nothing visible (the distortion
    is entirely off-frame) and bounds the work.
    """
    low_x, high_x = -width, 2 * width
    low_y, high_y = -height, 2 * height
    return [
        (min(high_x, max(low_x, x)), min(high_y, max(low_y, y)))
        for x, y in points
    ]


def _simplify(
    points: List[Tuple[float, float]], min_spacing: float = MIN_VERTEX_SPACING
) -> List[Tuple[float, float]]:
    """Drop vertices closer than min_spacing to the previous kept one.

    A plain distance filter rather than Douglas-Peucker: at sub-pixel tolerance
    the two are visually identical, and this is one linear pass with no
    recursion over 168k-point rings.
    """
    if len(points) < SIMPLIFY_MIN_POINTS:
        return points
    kept = [points[0]]
    threshold = min_spacing * min_spacing
    for point in points[1:-1]:
        last = kept[-1]
        dx = point[0] - last[0]
        dy = point[1] - last[1]
        if dx * dx + dy * dy >= threshold:
            kept.append(point)
    kept.append(points[-1])
    # A ring that collapses below a triangle was smaller than the tolerance;
    # keep the original rather than dropping the shape entirely.
    return kept if len(kept) >= 3 else points


def _draw_polygons(
    draw: ImageDraw.ImageDraw,
    viewport: Viewport,
    polygons: Sequence[Polygon],
    fill: Color = None,
    hole_fill: Color = None,
    outline: Color = None,
    outline_width: float = 1.0,
) -> None:
    """Fill and/or outline a set of polygons.

    Rings after the first are holes: filled with hole_fill (the colour of
    whatever sits underneath) rather than cut out, since Pillow cannot subtract
    from an already-drawn shape.
    """
    width, height = viewport.width, viewport.height
    line_width = max(1, int(round(outline_width)))

    for polygon in polygons:
        for index, ring in enumerate(polygon):
            points = _simplify(_clamp_points(viewport.project_ring(ring), width, height))
            if len(points) < 3:
                continue
            is_hole = index > 0
            ring_fill = hole_fill if is_hole else fill
            if ring_fill is not None:
                draw.polygon(points, fill=ring_fill)
            if outline is not None:
                # polygon() has no width parameter, so outlines are drawn as a
                # closed polyline.
                draw.line(points + [points[0]], fill=outline, width=line_width, joint="curve")


def _polygon_mask(
    size: Tuple[int, int], viewport: Viewport, polygons: Sequence[Polygon]
) -> Image.Image:
    """A white-on-black mask of the filled area of `polygons` (holes excluded)."""
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    _draw_polygons(draw, viewport, polygons, fill=255, hole_fill=0)
    return mask


def _draw_highlight_clipped(
    image: Image.Image,
    viewport: Viewport,
    highlight_polygons: Sequence[Polygon],
    land_polygons: Sequence[Polygon],
    style: Style,
) -> bool:
    """Fill the highlight, but only where it overlaps land.

    OSM's administrative boundary for a country is not its coastline: it
    includes territorial waters, so filling it raw gives a smooth blob well out
    to sea plus stray discs around remote islands (the 12-mile zones). Masking
    against the basemap landmass is what turns that boundary back into the
    country's actual shape.

    Returns False when nothing survives the mask -- the region sits outside the
    basemap's land coverage -- so the caller can fall back to an unclipped fill
    rather than render a blank map.
    """
    size = image.size
    combined = ImageChops.multiply(
        _polygon_mask(size, viewport, highlight_polygons),
        _polygon_mask(size, viewport, land_polygons),
    )
    if combined.getbbox() is None:
        return False

    image.paste(Image.new("RGB", size, style.highlight), mask=combined)
    return True


def render_card(
    viewport: Viewport,
    land_polygons: Sequence[Polygon],
    border_polygons: Sequence[Polygon],
    highlight_polygons: Sequence[Polygon],
    caption: str,
    width: int = 1280,
    height: int = 720,
    highlight_under_land: bool = False,
    clip_to_land: bool = True,
    style: Style = None,
    seed: Optional[int] = None,
) -> RenderResult:
    """Compose the finished card and encode it as PNG.

    highlight_under_land puts the red shape beneath the landmass. Sea polygons
    are coarse and overlap the coast, so drawing them on top swallows islands
    and smears the shoreline; underneath, the land punches back through and the
    coastline stays sharp.

    clip_to_land masks a land highlight to the landmass, which is what strips
    the territorial waters out of an OSM country boundary. Ignored when the
    highlight is drawn under the land, where the draw order already does it.

    seed pins the caption's random tilt and sideways nudge, so the same call
    renders the same card twice. Left as None every render differs slightly.
    """
    style = style or Style()

    scale = SUPERSAMPLE
    big = Image.new("RGB", (width * scale, height * scale), style.ocean)
    draw = ImageDraw.Draw(big)

    # The viewport was built for the final size; drawing happens on the
    # supersampled canvas, so make a matching one scaled up.
    big_viewport = Viewport(
        center_lon=viewport.center_lon,
        min_x=viewport.min_x,
        max_x=viewport.max_x,
        min_y=viewport.min_y,
        max_y=viewport.max_y,
        width=width * scale,
        height=height * scale,
    )

    def draw_highlight() -> None:
        _draw_polygons(
            draw,
            big_viewport,
            highlight_polygons,
            fill=style.highlight,
            # Holes are enclaves or islands: whatever the highlight sits on.
            hole_fill=style.ocean if highlight_under_land else style.land,
        )

    if highlight_under_land:
        draw_highlight()

    _draw_polygons(draw, big_viewport, land_polygons, fill=style.land, hole_fill=style.ocean)
    _draw_polygons(
        draw,
        big_viewport,
        border_polygons,
        outline=style.border,
        outline_width=style.border_width * scale,
    )
    # Coastlines last of the greys, so they sit on top of the internal borders.
    _draw_polygons(
        draw,
        big_viewport,
        land_polygons,
        outline=style.coast,
        outline_width=style.coast_width * scale,
    )

    if not highlight_under_land:
        clipped = False
        if clip_to_land and land_polygons:
            clipped = _draw_highlight_clipped(
                big, big_viewport, highlight_polygons, land_polygons, style
            )
        if not clipped:
            draw_highlight()

    canvas = big.resize((width, height), Image.LANCZOS)
    # Before the caption, so the banner sits on top of the vignette at full
    # brightness however close to the frame edge it lands.
    _apply_vignette(canvas, style)
    lines, angle, offset_x = _draw_caption(canvas, caption, style, random.Random(seed))

    buffer = io.BytesIO()
    canvas.save(buffer, format="PNG", optimize=True)
    return RenderResult(
        png=buffer.getvalue(),
        width=width,
        height=height,
        caption_lines=lines,
        caption_angle=angle,
        caption_offset_x=offset_x,
    )


# Resolution the vignette gradient is computed at before being scaled up. It is
# a smooth radial ramp, so a coarse grid interpolates to something identical to
# a full-size one -- and costs a few thousand operations instead of a million.
VIGNETTE_GRID = 96


def _apply_vignette(canvas: Image.Image, style: Style) -> None:
    """Darken the frame edges slightly, in place.

    Squared falloff normalized to the CORNER distance, so the ramp is still
    climbing when it reaches the edge instead of flattening out into a uniform
    dark band the way an edge-normalized gradient does.
    """
    if style.vignette_strength <= 0:
        return

    inner = min(style.vignette_inner, 0.99)
    values = []
    for row in range(VIGNETTE_GRID):
        offset_y = (row + 0.5) / VIGNETTE_GRID * 2 - 1
        for column in range(VIGNETTE_GRID):
            offset_x = (column + 0.5) / VIGNETTE_GRID * 2 - 1
            distance = math.hypot(offset_x, offset_y) / math.sqrt(2)
            ramp = max(0.0, (distance - inner) / (1 - inner))
            values.append(int(255 * style.vignette_strength * ramp * ramp))

    mask = Image.new("L", (VIGNETTE_GRID, VIGNETTE_GRID))
    mask.putdata(values)
    # Stretching the square grid to the canvas turns the circular ramp into an
    # ellipse that follows the frame, which is what a vignette should do.
    canvas.paste(
        Image.new("RGB", canvas.size, style.shadow),
        (0, 0),
        mask.resize(canvas.size, Image.BICUBIC),
    )


def _draw_caption(
    canvas: Image.Image, caption: str, style: Style, rng: random.Random
) -> Tuple[List[str], float, float]:
    """Draw the banner and its text: auto-sized, haloed, slightly tilted.

    Returns the lines drawn plus the tilt and sideways nudge used.
    """
    lines = [line.strip() for line in (caption or "").splitlines() if line.strip()]
    if not lines:
        return [], 0.0, 0.0

    width, height = canvas.size
    probe = ImageDraw.Draw(canvas)

    jitter_x = width * style.caption_jitter_x
    # The sideways nudge eats into the horizontal room, so the fitting budget
    # has to reserve it up front -- otherwise a long caption that "just fits"
    # runs off the frame the moment it is nudged. Padding counts too: the
    # banner, not the text, is what has to stay inside the frame.
    max_banner_width = width * style.caption_max_width - 2 * jitter_x
    max_line_height = height * style.caption_max_line_height

    # Shrink until the widest line fits the width budget. Starting from the
    # height budget means short captions come out at the maximum size, like the
    # reference card.
    font_size = int(max_line_height)
    font = load_font(font_size)
    while font_size > 12:
        font = load_font(font_size)
        widest = max(probe.textlength(line, font=font) for line in lines)
        if widest + 2 * font_size * style.caption_padding_x <= max_banner_width:
            break
        font_size -= 2

    spacing = font_size * style.caption_line_spacing
    pad_x = font_size * style.caption_padding_x
    pad_y = font_size * style.caption_padding_y

    text = "\n".join(lines)
    bbox = probe.multiline_textbbox((0, 0), text, font=font, spacing=spacing, align="center")
    banner_width = int(round(bbox[2] - bbox[0] + 2 * pad_x))
    banner_height = int(round(bbox[3] - bbox[1] + 2 * pad_y))

    # Build the banner on its own transparent layer. Box and text then rotate
    # as one piece (rotating them separately would misalign them), and the
    # shadow can be taken from the finished silhouette instead of guessed at.
    blur = font_size * style.shadow_blur
    grow = int(font_size * style.shadow_grow)
    margin = int(round(3 * blur)) + grow + 8
    layer = Image.new(
        "RGBA", (banner_width + 2 * margin, banner_height + 2 * margin), (0, 0, 0, 0)
    )
    layer_draw = ImageDraw.Draw(layer)
    layer_draw.rectangle(
        [margin, margin, margin + banner_width, margin + banner_height],
        fill=style.banner + (255,),
    )
    # Offset by the bbox origin: FreeType's reported box does not start at the
    # anchor, and ignoring that leaves the text visibly off-centre.
    layer_draw.multiline_text(
        (margin + pad_x - bbox[0], margin + pad_y - bbox[1]),
        text,
        font=font,
        fill=style.text + (255,),
        spacing=spacing,
        align="center",
    )

    angle = rng.uniform(-style.caption_max_angle, style.caption_max_angle)
    offset_x = rng.uniform(-jitter_x, jitter_x)
    if angle:
        # expand: a tilted banner is taller than an upright one, and clipping
        # its corners off would be far more obvious than the tilt itself.
        layer = layer.rotate(angle, resample=Image.BICUBIC, expand=True)

    # Halo rather than a plain drop shadow: widening the alpha before blurring
    # puts shadow ABOVE the banner as well as below, which is the only thing
    # separating a banner from the identically-coloured region behind it.
    silhouette = layer.getchannel("A")
    if grow >= 1:
        silhouette = silhouette.filter(ImageFilter.MaxFilter(2 * grow + 1))

    # Two passes, because one cannot do both jobs: a blur wide enough to fade
    # out smoothly is far too weak right at the banner edge, and one tight
    # enough to bite there ends in a hard rim.
    contact = _fade(silhouette, blur * style.shadow_contact, style.shadow_opacity * 0.9)
    ambient = _fade(silhouette, blur, style.shadow_opacity * 0.6)

    left = int(round(width / 2 + offset_x - layer.width / 2))
    top = int(round(height * style.caption_center_y - layer.height / 2))
    drop = int(round(font_size * style.shadow_offset_y))
    solid = Image.new("RGB", layer.size, style.shadow)
    canvas.paste(solid, (left, top + drop), ambient)
    canvas.paste(solid, (left, top + drop // 3), contact)
    canvas.paste(layer, (left, top), layer)
    return lines, angle, offset_x


def _fade(alpha: Image.Image, blur: float, opacity: float) -> Image.Image:
    """One blurred, faded copy of a silhouette, ready to use as a shadow mask."""
    return alpha.filter(ImageFilter.GaussianBlur(blur)).point(
        lambda value: int(value * opacity)
    )
