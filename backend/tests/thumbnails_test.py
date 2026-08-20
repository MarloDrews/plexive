"""Tests for the thumbnail generators (backend/app/thumbnails/).

Covers the parts that are easy to get silently wrong:

- Projection units: Mercator northing must come out in the SAME units as
  longitude. Mixing radians and degrees flattened every map by ~57x and the
  output still looked like a map, just a wrong one.
- Antimeridian: a shape crossing +/-180 must bound to a narrow span, not to
  the whole world.
- Geometry flattening across every GeoJSON type the two data sources emit.
- Draw order: highlight_under_land really puts the landmass on top.
- Caption auto-sizing stays inside the frame for a long caption, for EVERY
  random tilt/offset the jitter can produce -- not just the unjittered one.
- The banner halo really darkens the gap between banner and marked region,
  which is the only thing separating two areas of the same colour.
- The vignette darkens the corners without touching the centre or tinting.
- Every colour profile, including yellow's flipped (dark) caption text, and the
  "auto" palette that spreads neutral subjects across the rest.
- Both themes: a theme moves every grey and nothing else, and "auto" spreads
  dark and light across the feed without tracking the colour.
- Both caption typefaces, and a caption that only fits because the fitting
  loop reserves room for the WORST tilt the style allows.
- The "+" union and the OSM -> Natural Earth fallback, with both data sources
  stubbed so the suite never touches the network.
- Request schema validation.
- The mental card: that brain_in_head is framed on the HEAD's bounding box, so
  the brain stays where the 3D camera put it; that tinting normalises a pale
  render before colouring it, and against the figure rather than the
  transparent surround; that a layer exported without alpha is keyed from the
  frame edge inwards, so an enclosed highlight is not punched through; and that
  the contact shadow spreads PAST the silhouette instead of being clipped to it
  (the figure touches its own bounding box on all four sides, so blurring in
  place drew a rectangle around the head). Its artwork is built per test in a temp directory -- a test that
  failed because someone re-exported a head would be a test nobody trusts.

Nothing here downloads a basemap, calls Nominatim, or reads the real 3D
renders.

Run with: venv\\Scripts\\python.exe tests\\thumbnails_test.py
"""

import io
import json
import math
import os
import sys
from dataclasses import replace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image  # noqa: E402

from app.thumbnails import basemap, nominatim, places, service  # noqa: E402
from app.thumbnails.geometry import all_rings, polygons_from_geometry  # noqa: E402
from app.thumbnails.projection import bounds_of, fit  # noqa: E402
from app.thumbnails.render import (  # noqa: E402
    PALETTES,
    THEMES,
    PaletteError,
    Style,
    ThemeError,
    build_style,
    render_card,
    style_for_palette,
    style_for_theme,
)

PASS = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASS
    if not condition:
        raise AssertionError(f"FAIL: {name} {detail}")
    PASS += 1
    print(f"ok: {name}")


def square(lon: float, lat: float, size: float):
    """One square polygon centred on (lon, lat), as a GeoJSON-shaped ring list."""
    half = size / 2
    return [[
        [lon - half, lat - half],
        [lon + half, lat - half],
        [lon + half, lat + half],
        [lon - half, lat + half],
        [lon - half, lat - half],
    ]]


# ---------------------------------------------------------------------------
# Projection
# ---------------------------------------------------------------------------

def test_projection_units_are_consistent() -> None:
    """A degree of latitude and a degree of longitude must project to roughly
    the same number of pixels at the equator. The radians/degrees mix-up made
    the latitude step ~57x smaller."""
    viewport = fit((-5.0, -5.0, 5.0, 5.0), 1280, 720, padding=0.0)
    x0, y0 = viewport.project(0.0, 0.0)
    x1, _ = viewport.project(1.0, 0.0)
    _, y1 = viewport.project(0.0, 1.0)
    lon_pixels = abs(x1 - x0)
    lat_pixels = abs(y1 - y0)
    check(
        "one degree lat ~= one degree lon at the equator",
        0.9 < lat_pixels / lon_pixels < 1.1,
        f"lon={lon_pixels:.2f}px lat={lat_pixels:.2f}px",
    )


def test_fit_preserves_aspect() -> None:
    """A tall region must not be stretched to fill a 16:9 frame."""
    viewport = fit((0.0, 0.0, 1.0, 20.0), 1280, 720, padding=0.0)
    x0, y0 = viewport.project(0.0, 0.0)
    x1, _ = viewport.project(1.0, 0.0)
    _, y1 = viewport.project(0.0, 1.0)
    check(
        "scale is uniform on both axes",
        abs(abs(x1 - x0) - abs(y1 - y0)) < 0.5,
        f"x={abs(x1 - x0):.3f} y={abs(y1 - y0):.3f}",
    )


def test_north_is_up() -> None:
    viewport = fit((-10.0, -10.0, 10.0, 10.0), 1280, 720, padding=0.0)
    _, y_north = viewport.project(0.0, 5.0)
    _, y_south = viewport.project(0.0, -5.0)
    check("higher latitude is higher on screen", y_north < y_south)


def test_antimeridian_bounds_stay_narrow() -> None:
    """A ring spanning 175E..175W is 10 degrees wide, not 350."""
    ring = [[175.0, 0.0], [-175.0, 0.0], [-175.0, 5.0], [175.0, 5.0], [175.0, 0.0]]
    min_lon, _, max_lon, _ = bounds_of([ring])
    check(
        "antimeridian span is the short way round",
        abs((max_lon - min_lon) - 10.0) < 0.001,
        f"span={max_lon - min_lon}",
    )


def test_lon_lat_bounds_round_trip() -> None:
    viewport = fit((10.0, 40.0, 20.0, 50.0), 1280, 720, padding=0.0)
    min_lon, min_lat, max_lon, max_lat = viewport.lon_lat_bounds()
    # The mercator round trip is not bit-exact, so allow a hair of slack.
    slack = 1e-6
    check(
        "viewport bounds contain the subject",
        min_lon <= 10.0 + slack
        and max_lon >= 20.0 - slack
        and min_lat <= 40.0 + slack
        and max_lat >= 50.0 - slack,
        f"{viewport.lon_lat_bounds()}",
    )


# ---------------------------------------------------------------------------
# Geometry flattening
# ---------------------------------------------------------------------------

def test_geometry_types() -> None:
    polygon = {"type": "Polygon", "coordinates": square(0, 0, 2)}
    multi = {"type": "MultiPolygon", "coordinates": [square(0, 0, 2), square(5, 5, 2)]}
    collection = {"type": "GeometryCollection", "geometries": [polygon, multi]}
    line = {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}
    point = {"type": "Point", "coordinates": [0, 0]}

    check("Polygon flattens to one", len(polygons_from_geometry(polygon)) == 1)
    check("MultiPolygon flattens to two", len(polygons_from_geometry(multi)) == 2)
    check("GeometryCollection flattens to three", len(polygons_from_geometry(collection)) == 3)
    check("LineString is not fillable", polygons_from_geometry(line) == [])
    check("Point is not fillable", polygons_from_geometry(point) == [])
    check("garbage is not fillable", polygons_from_geometry({"type": "Polygon"}) == [])


def test_degenerate_rings_dropped() -> None:
    """A two-point ring has no area and would crash Pillow's polygon()."""
    geometry = {"type": "Polygon", "coordinates": [[[0, 0], [1, 1]]]}
    check("two-point ring dropped", polygons_from_geometry(geometry) == [])


def test_holes_are_preserved() -> None:
    geometry = {"type": "Polygon", "coordinates": square(0, 0, 10) + square(0, 0, 2)}
    polygons = polygons_from_geometry(geometry)
    check("hole kept as a second ring", len(polygons) == 1 and len(polygons[0]) == 2)
    check("all_rings walks both", len(all_rings(polygons)) == 2)


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def _render(
    highlight_under_land: bool,
    caption: str = "TEST",
    land=None,
    highlight=None,
    clip_to_land: bool = True,
    palette: str = "red",
    seed: int = 0,
    padding: float = 1.0,
    theme: str = "dark",
    font: str = "sans",
):
    """A tiny synthetic scene: one land square with a highlight square on it.

    The seed is pinned so the caption's random tilt and offset cannot make a
    test flaky; the tests that care about the jitter vary it themselves.
    """
    style = build_style(palette, theme, font)
    land = land if land is not None else [square(0, 0, 20)]
    highlight = highlight if highlight is not None else [square(0, 0, 10)]
    viewport = fit(bounds_of(all_rings(highlight)), 1280, 720, padding=padding)
    result = render_card(
        viewport=viewport,
        land_polygons=land,
        border_polygons=[],
        highlight_polygons=highlight,
        caption=caption,
        highlight_under_land=highlight_under_land,
        clip_to_land=clip_to_land,
        style=style,
        seed=seed,
    )
    return result, Image.open(io.BytesIO(result.png)).convert("RGB"), style


def test_render_size_and_format() -> None:
    result, image, _ = _render(False)
    check("PNG magic bytes", result.png[:8] == b"\x89PNG\r\n\x1a\n")
    check("1280x720", image.size == (1280, 720), str(image.size))


def test_highlight_over_land_covers_it() -> None:
    _, image, style = _render(False)
    # Centre of the frame is inside both the land square and the highlight.
    pixel = image.getpixel((640, 360))
    check(
        "centre is red when drawn over land",
        _close(pixel, style.highlight),
        f"{pixel} vs {style.highlight}",
    )


def test_highlight_under_land_is_covered() -> None:
    _, image, style = _render(True)
    pixel = image.getpixel((640, 360))
    check(
        "centre is land when drawn under it",
        _close(pixel, style.land),
        f"{pixel} vs {style.land}",
    )


def test_clip_to_land_strips_territorial_waters() -> None:
    """An OSM country boundary extends past the coast (territorial waters).
    Clipping must keep only the part that overlaps the landmass."""
    land = [square(0, 0, 10)]
    highlight = [square(0, 0, 20)]  # the boundary, overhanging the coast
    _, image, style = _render(False, land=land, highlight=highlight, clip_to_land=True)
    # The subject is the 20-degree highlight, padded 1.0 -> 60 degrees tall:
    # the highlight spans y 240..480 and the 10-degree land only y 300..420,
    # so y=270 is inside the boundary but out at sea.
    check(
        "inside the coast is red",
        _close(image.getpixel((640, 360)), style.highlight),
        str(image.getpixel((640, 360))),
    )
    check(
        "overhang past the coast is not red",
        not _close(image.getpixel((640, 270)), style.highlight),
        str(image.getpixel((640, 270))),
    )


def test_clip_can_be_turned_off() -> None:
    land = [square(0, 0, 10)]
    highlight = [square(0, 0, 20)]
    _, image, style = _render(False, land=land, highlight=highlight, clip_to_land=False)
    check(
        "unclipped keeps the overhang",
        _close(image.getpixel((640, 270)), style.highlight),
        str(image.getpixel((640, 270))),
    )


def test_clip_falls_back_when_land_does_not_overlap() -> None:
    """A region outside the basemap's land coverage must still render, not
    come out blank."""
    land = [square(170, 60, 2)]  # nowhere near the highlight
    highlight = [square(0, 0, 10)]
    _, image, style = _render(False, land=land, highlight=highlight, clip_to_land=True)
    check(
        "falls back to an unclipped fill",
        _close(image.getpixel((640, 360)), style.highlight),
        str(image.getpixel((640, 360))),
    )


def test_simplify_bounds_vertex_count() -> None:
    """Sub-pixel detail is dropped, but a small ring is left untouched so tiny
    islands cannot vanish."""
    from app.thumbnails.render import _simplify

    dense = [(float(i) * 0.01, 0.0) for i in range(5000)]
    check("dense ring is thinned", len(_simplify(dense)) < 200, str(len(_simplify(dense))))
    small = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    check("small ring untouched", _simplify(small) == small)
    check("endpoints preserved", _simplify(dense)[0] == dense[0] and _simplify(dense)[-1] == dense[-1])


def test_ocean_outside_land() -> None:
    # Sampled above the land square rather than in a corner: corners carry the
    # vignette, which test_vignette_darkens_the_edges owns.
    _, image, style = _render(False)
    pixel = image.getpixel((640, 60))
    check("outside the land is ocean", _close(pixel, style.ocean), str(pixel))


def test_vignette_darkens_the_edges() -> None:
    """Visible at the corners, absent at the centre, and neutral throughout --
    it must not crush the edges to black or tint anything."""
    _, image, style = _render(False)
    centre = image.getpixel((640, 360))
    corner = image.getpixel((4, 4))
    edge = image.getpixel((640, 4))  # mid-edge: nearer the centre than a corner
    check("centre is untouched", _close(centre, style.highlight), str(centre))
    drop = sum(style.ocean) - sum(corner)
    check(
        "the corner drop is clearly visible",
        0.25 < drop / sum(style.ocean) < 0.55,
        f"drop={drop} of {sum(style.ocean)}",
    )
    check(
        "the ramp falls off towards the centre",
        sum(edge) > sum(corner),
        f"edge={sum(edge)} corner={sum(corner)}",
    )
    check("no colour cast", max(corner) - min(corner) <= max(style.ocean) - min(style.ocean))


def test_vignette_can_be_turned_off() -> None:
    from dataclasses import replace

    style = replace(Style(), vignette_strength=0.0)
    viewport = fit(bounds_of(all_rings([square(0, 0, 10)])), 1280, 720, padding=1.0)
    result = render_card(
        viewport=viewport,
        land_polygons=[square(0, 0, 20)],
        border_polygons=[],
        highlight_polygons=[square(0, 0, 10)],
        caption="TEST",
        style=style,
        seed=0,
    )
    image = Image.open(io.BytesIO(result.png)).convert("RGB")
    check(
        "strength 0 leaves the corner at the raw ocean colour",
        _close(image.getpixel((4, 4)), style.ocean, tolerance=2),
        str(image.getpixel((4, 4))),
    )


def test_caption_banner_drawn() -> None:
    result, image, style = _render(False, "ALMOST DRIED UP")
    reds = _count_close(image.crop((0, 480, 1280, 600)), style.banner, tolerance=12)
    check("banner covers a real area", reds > 20000, f"red pixels={reds}")
    check("caption lines reported", result.caption_lines == ["ALMOST DRIED UP"])


def test_long_caption_stays_in_frame() -> None:
    """Auto-sizing must shrink the font rather than let the banner run off, and
    it must reserve room for the random sideways nudge -- a caption that only
    fits unjittered would bleed off frame on some seeds."""
    long_caption = "A VERY LONG HEADLINE THAT WOULD OTHERWISE OVERFLOW THE FRAME ENTIRELY"
    for seed in range(8):
        _, image, style = _render(False, long_caption, seed=seed)
        left = _count_close(image.crop((0, 380, 6, 700)), style.banner, tolerance=12)
        right = _count_close(image.crop((1274, 380, 1280, 700)), style.banner, tolerance=12)
        check(
            f"banner clears both edges (seed {seed})",
            left == 0 and right == 0,
            f"left={left} right={right}",
        )


def test_multiline_caption() -> None:
    result, _, _ = _render(False, "FIRST LINE\nSECOND LINE")
    check("two lines kept", result.caption_lines == ["FIRST LINE", "SECOND LINE"])


def test_empty_caption_draws_no_banner() -> None:
    result, image, style = _render(False, "")
    check("no caption reported", result.caption_lines == [])
    # The highlight is the same red, so only the rows below the map can prove
    # no banner was drawn.
    banner_reds = _count_close(image.crop((0, 620, 1280, 720)), style.banner, tolerance=12)
    check("no banner below the map", banner_reds == 0, f"banner_band={banner_reds}")


# ---------------------------------------------------------------------------
# Caption jitter, halo and colour profiles
# ---------------------------------------------------------------------------

def test_caption_jitter_is_seeded() -> None:
    """The same seed must reproduce the card exactly; a different one must not."""
    first, _, _ = _render(False, "ALMOST DRIED UP", seed=7)
    same, _, _ = _render(False, "ALMOST DRIED UP", seed=7)
    other, _, _ = _render(False, "ALMOST DRIED UP", seed=8)
    check("same seed is byte-identical", first.png == same.png)
    check("a different seed moves the banner", first.png != other.png)


def test_caption_jitter_amplitude_is_small() -> None:
    """A hand-placed look, not a broken layout: the tilt and nudge stay inside
    the declared amplitude, and both really vary."""
    style = Style()
    angles, offsets = [], []
    for seed in range(24):
        result, _, _ = _render(False, "ALMOST DRIED UP", seed=seed)
        angles.append(result.caption_angle)
        offsets.append(result.caption_offset_x)
    check(
        "tilt stays within the declared amplitude",
        all(abs(angle) <= style.caption_max_angle for angle in angles),
        f"max={max(abs(a) for a in angles):.2f} deg",
    )
    check(
        "sideways nudge stays within the declared amplitude",
        all(abs(offset) <= 1280 * style.caption_jitter_x for offset in offsets),
        f"max={max(abs(o) for o in offsets):.1f}px",
    )
    check("tilt goes both ways", min(angles) < 0 < max(angles))
    check("nudge goes both ways", min(offsets) < 0 < max(offsets))


def test_empty_caption_has_no_jitter() -> None:
    result, _, _ = _render(False, "")
    check("nothing to place, nothing placed", result.caption_angle == 0.0)


def test_banner_halo_separates_it_from_the_highlight() -> None:
    """Banner and marked region are the SAME colour, so with a plain drop
    shadow the banner's upper edge would be invisible. The halo has to darken
    the gap above the banner, not just below it."""
    # No padding: the marked region fills the frame, banner included.
    covering = [square(0, 0, 20)]
    _, image, style = _render(
        False, "ALMOST DRIED UP", land=covering, highlight=covering, padding=0.0
    )
    # Straight down the middle, from well above the banner to its centre.
    column = [image.getpixel((640, y)) for y in range(400, 544)]
    darkest = min(sum(pixel) for pixel in column)
    check(
        "a dark band sits between the region and the banner",
        darkest < sum(style.highlight) - 60,
        f"darkest={darkest} highlight={sum(style.highlight)}",
    )


def test_every_palette_colours_the_region_and_banner() -> None:
    for name, palette in PALETTES.items():
        result, image, _ = _render(False, "ALMOST DRIED UP", palette=name)
        check(
            f"{name}: region is filled with the profile colour",
            _close(image.getpixel((640, 360)), palette.highlight),
            f"{image.getpixel((640, 360))} vs {palette.highlight}",
        )
        banner = _count_close(image.crop((0, 480, 1280, 600)), palette.banner, tolerance=12)
        check(f"{name}: banner covers a real area", banner > 20000, f"pixels={banner}")
        check(f"{name}: caption still reported", result.caption_lines == ["ALMOST DRIED UP"])


def _relative_luminance(colour) -> float:
    """WCAG relative luminance of an sRGB colour."""
    channels = []
    for value in colour:
        value /= 255.0
        channels.append(value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def test_every_palette_has_a_readable_caption() -> None:
    """The caption sits on the banner in every profile, so every profile has to
    carry enough contrast for it. Yellow is the reason this is checked rather
    than assumed: white on yellow is unreadable, so that one profile flips to
    near-black letters, and any palette added later has to make the same call."""
    for name, palette in PALETTES.items():
        text = _relative_luminance(palette.text)
        banner = _relative_luminance(palette.banner)
        high, low = max(text, banner), min(text, banner)
        contrast = (high + 0.05) / (low + 0.05)
        # 3:1 is the WCAG floor for large text, which the caption always is.
        check(f"{name}: caption contrasts with its banner",
              contrast >= 3.0, f"contrast {contrast:.2f}")
    check("yellow is the one that flips to dark text",
          sum(PALETTES["yellow"].text) < 200)


def test_line_width_follows_the_zoom() -> None:
    """Coastlines and borders thicken as the card closes in.

    The widths in Style are pixels, so they were written for a continent-sized
    view: on the Oregon card, one state filling the frame, the state lines and
    the coast came out as barely visible hairlines.
    """
    from app.thumbnails.projection import fit_polar, fit_subject
    from app.thumbnails.render import LINE_SCALE_MAX, line_width_scale

    world = line_width_scale(360.0)
    continent = line_width_scale(90.0)
    state = line_width_scale(12.0)
    check("a world card keeps the reference widths", world == 1.0, str(world))
    check("a continent card keeps them too", continent == 1.0, str(continent))
    check("a state-sized card draws thicker lines", 1.5 < state < LINE_SCALE_MAX, str(state))
    check("the widths are capped", line_width_scale(0.5) == LINE_SCALE_MAX)
    check("a zero span does not divide by zero", line_width_scale(0.0) == 1.0)

    # Both projections have to report a span the renderer can compare.
    oregon = fit_subject([[[-124.6, 42.0], [-116.5, 42.0], [-116.5, 46.3], [-124.6, 46.3]]],
                         1280, 720, padding=0.35)
    check("a Mercator viewport reports its span in degrees",
          10 < oregon.visible_span_degrees < 30, str(oregon.visible_span_degrees))
    check("the Oregon card really is in the thickened range",
          line_width_scale(oregon.visible_span_degrees) > 1.5)

    antarctica = fit_polar([_pole_ring(-70.0)], "south", 1280, 720, padding=0.3)
    check("a polar viewport reports a comparable angle",
          30 < antarctica.visible_span_degrees < 180, str(antarctica.visible_span_degrees))


def test_caption_punctuation_the_font_cannot_draw() -> None:
    """A caption is normalised to what the font actually has glyphs for.

    Arial Bold has no U+2011, the non-breaking hyphen a writing tool leaves in
    "Flat-Earth", so the card came out reading "FLAT[]EARTH MYTH". The .notdef
    box is a normal-width glyph, so every measurement of the text agreed it was
    fine -- only the rendered card showed it.
    """
    from app.thumbnails.render import plain_text

    check("the non-breaking hyphen becomes a plain one",
          plain_text("FLAT‑EARTH MYTH") == "FLAT-EARTH MYTH")
    check("dashes, quotes and ellipsis are normalised too",
          plain_text("–—‘’“”…") == "--''\"\"...")
    check("ordinary text is untouched", plain_text("ALMOST DRIED UP") == "ALMOST DRIED UP")

    result, _, _ = _render(False, "FLAT‑EARTH MYTH")
    check("the drawn caption is the normalised one",
          result.caption_lines == ["FLAT-EARTH MYTH"], str(result.caption_lines))


def test_auto_palette_spreads_the_colours() -> None:
    """"auto" is what a card gets when nothing about the subject suggests a
    colour -- which is most of them. A fixed default made 6 of the 10 posts
    that had a spec come out red."""
    from collections import Counter

    from app.thumbnails.render import auto_palette_for, resolve_palette

    subjects = [
        "United Kingdom|Banks make the money",
        "United States|Lead paint legal",
        "California|Look at each department",
        "Europe|Nobody thought it was flat",
        "Oregon|One fungus, 9 square km",
        "Siberia|Huge carbon store",
        "Africa|No Neanderthal DNA",
        "Japan|Trains to the second",
        "Iceland|Runs on its own heat",
        "Chile|Driest place on Earth",
    ]
    chosen = [resolve_palette("auto", subject) for subject in subjects]
    check("auto only ever returns a real palette",
          all(name in PALETTES for name in chosen), str(chosen))
    # Yellow is in the cycle now. The card has four colours in total, and
    # yellow's dark caption text makes it as legible as the other three, so
    # there is nothing left to hold back from a neutral subject.
    check("auto can return any of the four",
          set(chosen) <= set(PALETTES), str(chosen))
    # Hashing spreads, it does not deal a round: ten subjects over four
    # colours land on three or four of them, which is the point -- what must
    # not come back is one colour taking half the feed, as red did.
    counts = Counter(chosen)
    check("ten neutral subjects use several colours",
          len(counts) >= 3, f"{len(counts)}: {counts}")
    check("no colour takes over the feed",
          max(counts.values()) <= 4, str(counts))
    # The stored filename carries a content hash, so a colour that moved
    # between runs would orphan a fresh image in storage every time.
    check("the same subject always gets the same colour",
          chosen == [resolve_palette("auto", subject) for subject in subjects])
    check("case and spacing do not change the colour",
          auto_palette_for("  Iceland|Runs On Its Own Heat  ".upper())
          == auto_palette_for("iceland|runs on its own heat"))

    check("an explicit palette is left alone", resolve_palette("blue", "x") == "blue")
    check("no palette at all means auto",
          resolve_palette(None, "United Kingdom|Banks make the money")
          == resolve_palette("auto", "United Kingdom|Banks make the money"))


def test_palette_leaves_the_map_grey() -> None:
    """Only the marked region gets colour; the basemap is grey in every profile."""
    for name in PALETTES:
        _, image, style = _render(False, "TEST", palette=name)
        check(f"{name}: ocean unchanged", _close(image.getpixel((640, 60)), style.ocean))
        # Inside the land square (y 120..600) but outside the highlight (240..480).
        check(f"{name}: land unchanged", _close(image.getpixel((640, 180)), style.land))


def test_theme_moves_every_grey_and_nothing_else() -> None:
    """A theme owns the basemap; the palette owns the colour. Swapping the
    theme must repaint ocean, land and coast without touching the marked
    region or its banner."""
    for name in THEMES:
        _, image, style = _render(False, "TEST", palette="red", theme=name)
        check(f"{name}: ocean is the theme's",
              _close(image.getpixel((640, 60)), style.ocean),
              f"{image.getpixel((640, 60))} vs {style.ocean}")
        check(f"{name}: land is the theme's",
              _close(image.getpixel((640, 180)), style.land),
              f"{image.getpixel((640, 180))} vs {style.land}")
        check(f"{name}: the marked region keeps its colour",
              _close(image.getpixel((640, 360)), PALETTES["red"].highlight),
              str(image.getpixel((640, 360))))
    dark = style_for_theme("dark")
    light = style_for_theme("light")
    check("light really is lighter than dark",
          sum(light.ocean) > sum(dark.ocean) and sum(light.land) > sum(dark.land))
    check("land reads against ocean in both",
          abs(sum(light.land) - sum(light.ocean)) > 60
          and abs(sum(dark.land) - sum(dark.ocean)) > 60)


def test_auto_theme_spreads_and_is_stable() -> None:
    """Same contract as the auto palette: hashed so a card keeps its theme
    across re-renders, and spread so the feed is not all one theme. It hashes
    a different string from the palette on purpose -- moving together would
    cut the eight colour/theme combinations down to four."""
    from app.thumbnails.render import auto_palette_for, auto_theme_for, resolve_theme

    subjects = [
        "United Kingdom|Banks make the money",
        "United States|Lead paint legal",
        "California|Look at each department",
        "Europe|Nobody thought it was flat",
        "Oregon|One fungus, 9 square km",
        "Siberia|Huge carbon store",
        "Africa|No Neanderthal DNA",
        "Japan|Trains to the second",
        "Iceland|Runs on its own heat",
        "Chile|Driest place on Earth",
    ]
    chosen = [resolve_theme("auto", subject) for subject in subjects]
    check("auto only ever returns a real theme", set(chosen) <= set(THEMES), str(chosen))
    check("both themes appear", len(set(chosen)) == 2, str(chosen))
    check("the same subject always gets the same theme",
          chosen == [resolve_theme("auto", subject) for subject in subjects])
    check("case and spacing do not change the theme",
          auto_theme_for("  Iceland|Runs On Its Own Heat  ".upper())
          == auto_theme_for("iceland|runs on its own heat"))
    check("an explicit theme is left alone", resolve_theme("light", "x") == "light")
    # Not the same hash: if theme tracked colour, red would always be dark.
    check("theme does not track the palette",
          len({(auto_palette_for(s), auto_theme_for(s)) for s in subjects}) > 4,
          str([(auto_palette_for(s), auto_theme_for(s)) for s in subjects]))


def test_unknown_theme_rejected() -> None:
    for bad in ("dusk", "  ", "dunkel"):
        try:
            style_for_theme(bad)
            check(f"theme {bad!r} rejected", False, "no error raised")
        except ThemeError:
            check(f"theme {bad!r} rejected", True)
    check("None falls back to the default", style_for_theme(None).ocean == THEMES["dark"].ocean)


def test_both_fonts_draw_a_different_caption() -> None:
    """The two typefaces are a real choice, not a label: the same caption has
    to come out visibly different, and both have to stay inside the banner."""
    from app.thumbnails.fonts import FontError, load_font

    sans, _, _ = _render(False, "ALMOST DRIED UP", font="sans")
    serif, _, _ = _render(False, "ALMOST DRIED UP", font="serif")
    check("the two fonts render differently", sans.png != serif.png)
    check("both report the same lines", sans.caption_lines == serif.caption_lines)
    try:
        load_font(40, "comic")
        check("an unknown font is rejected", False, "no error raised")
    except FontError:
        check("an unknown font is rejected", True)


def test_unknown_palette_rejected() -> None:
    for bad in ("chartreuse", "  ", "rot"):
        try:
            style_for_palette(bad)
            check(f"palette {bad!r} rejected", False, "no error raised")
        except PaletteError:
            check(f"palette {bad!r} rejected", True)
    check("None falls back to the default", style_for_palette(None).banner == PALETTES["red"].banner)


def _close(pixel, target, tolerance: int = 24) -> bool:
    return all(abs(a - b) <= tolerance for a, b in zip(pixel, target))


def _count_close(image, target, tolerance: int = 24) -> int:
    """Pixels near `target`, counted over raw bytes (getdata is deprecated)."""
    data = image.convert("RGB").tobytes()
    return sum(
        1
        for index in range(0, len(data), 3)
        if _close(data[index:index + 3], target, tolerance)
    )


# ---------------------------------------------------------------------------
# Resolution: source selection, the "+" union, the Natural Earth fallback
# ---------------------------------------------------------------------------

class _Stub:
    """Swaps the two data sources for in-memory fixtures for one test."""

    def __init__(self, osm=None, named=None):
        self.osm = osm or {}
        self.named = named or {}
        self.osm_calls = []

    def __enter__(self):
        self._real_lookup = service.lookup_place
        self._real_named = basemap.find_named_feature

        def fake_lookup(place, use_cache=True):
            self.osm_calls.append(place)
            if place not in self.osm:
                raise nominatim.GeoLookupError(f"No OSM result for '{place}'.")
            return self.osm[place]

        def fake_named(name):
            return self.named.get(name)

        service.lookup_place = fake_lookup
        basemap.find_named_feature = fake_named
        return self

    def __exit__(self, *exc):
        service.lookup_place = self._real_lookup
        basemap.find_named_feature = self._real_named
        return False


def _osm_result(name, feature_type="administrative", lon=0.0, lat=0.0):
    return {
        "name": f"{name}, Somewhere",
        "osm_type": "relation",
        "osm_id": 1234,
        "category": "boundary",
        "feature_type": feature_type,
        "geojson": {"type": "Polygon", "coordinates": square(lon, lat, 4)},
    }


def _named_result(name, layer="marine", lon=0.0, lat=0.0):
    return {
        "name": name,
        "layer": layer,
        "polygons": polygons_from_geometry(
            {"type": "Polygon", "coordinates": square(lon, lat, 4)}
        ),
    }


def test_osm_is_preferred() -> None:
    with _Stub(osm={"Iceland": _osm_result("Iceland")}):
        _, meta = service._resolve_region("Iceland", None, True, "auto")
    check("resolved from osm", meta["source"] == "osm", meta["source"])
    check("short name kept", meta["name"] == "Iceland", meta["name"])


def test_natural_earth_fallback() -> None:
    """OSM has no polygon for a sea, so the marine layer answers instead.

    Uses a sea with no preset entry on purpose: a preset would pin the dataset
    and skip the OSM attempt this test is about.
    """
    with _Stub(named={"Coral Sea": _named_result("Coral Sea")}) as stub:
        _, meta = service._resolve_region("Coral Sea", None, True, "auto")
    check("fell back to natural earth", meta["source"] == "natural_earth", meta["source"])
    check("osm was tried first", stub.osm_calls == ["Coral Sea"], str(stub.osm_calls))
    check("marine layer marks it as water", meta["marine"] is True)


def test_source_osm_does_not_fall_back() -> None:
    with _Stub(named={"Sahara": _named_result("Sahara", layer="regions")}):
        try:
            service._resolve_region("Sahara", None, True, "osm")
            check("source=osm refuses the fallback", False, "no error raised")
        except nominatim.GeoLookupError:
            check("source=osm refuses the fallback", True)


def test_source_natural_earth_skips_osm() -> None:
    """The override exists because OSM resolves 'Sahara' to a village."""
    with _Stub(
        osm={"Sahara": _osm_result("Sahara village")},
        named={"Sahara": _named_result("Sahara", layer="regions")},
    ) as stub:
        _, meta = service._resolve_region("Sahara", None, True, "natural_earth")
    check("osm never queried", stub.osm_calls == [], str(stub.osm_calls))
    check("region layer used", meta["source"] == "natural_earth")
    check("a land region is not marine", meta["marine"] is False)


def test_place_preset_unions_its_parts() -> None:
    """A preset fills the sub-basins the data set keeps separate.

    The Baltic is stored without its two gulfs, so a bare lookup stops at the
    Swedish coast.
    """
    preset = places.find_preset("Baltic Sea")
    check("baltic has a preset", preset is not None)
    for gulf in ("Gulf of Bothnia", "Gulf of Finland"):
        check(f"{gulf} is part of it", gulf in preset.parts)

    named = {name: _named_result(name, lon=i, lat=58) for i, name in enumerate(preset.parts)}
    with _Stub(osm={"Baltic Sea": _osm_result("Baltic Sea")}, named=named) as stub:
        polygons, meta = service._resolve_region("Baltic Sea", None, True, "auto")
    check("every part is highlighted", len(polygons) == len(preset.parts), str(len(polygons)))
    check("reported under its own name", meta["name"] == "Baltic Sea", meta["name"])
    check("no single osm id for a composite", meta["osm_id"] is None)
    check("still marine", meta["marine"] is True)
    # The pinned dataset is the consistency guarantee: without it the render
    # would depend on what OSM's search ranks first that day.
    check("preset pins the dataset, osm never queried", stub.osm_calls == [], str(stub.osm_calls))


def test_place_preset_alias_and_override() -> None:
    check("alias resolves", places.find_preset("the mediterranean").name == "Mediterranean Sea")
    check("case and spacing ignored", places.find_preset("  MEDITERRANEAN   SEA ") is not None)
    check("an ordinary place has no preset", places.find_preset("Iceland") is None)
    check("empty name has no preset", places.find_preset("") is None)

    # A preset inside an explicit "+" union expands as well, and still reports
    # as one name -- otherwise "Baltic Sea + Black Sea" would quietly use the
    # incomplete basin again.
    parts = places.find_preset("Baltic Sea").parts
    named = {name: _named_result(name, lon=i, lat=58) for i, name in enumerate(parts)}
    named["Black Sea"] = _named_result("Black Sea", lon=33, lat=43)
    with _Stub(named=named):
        polygons, meta = service._resolve_region(
            "Baltic Sea + Black Sea", None, True, "natural_earth"
        )
    check("preset expands inside a union", len(polygons) == len(parts) + 1, str(len(polygons)))
    check("union of a preset and a place is named as both",
          meta["name"] == "Baltic Sea + Black Sea", meta["name"])

    # An explicit source= still wins over the preset's pinned dataset.
    with _Stub(osm={name: _osm_result(name, feature_type="sea") for name in parts}) as stub:
        _, meta = service._resolve_region("Baltic Sea", None, True, "osm")
    check("explicit source overrides the preset", stub.osm_calls == list(parts), str(stub.osm_calls))
    check("source reported as osm", meta["source"] == "osm", meta["source"])


def _inside_ring(ring, lon: float, lat: float) -> bool:
    """Ray casting: is (lon, lat) inside the closed ring?"""
    inside = False
    count = len(ring)
    for i in range(count):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % count]
        if (y1 > lat) != (y2 > lat):
            if x1 + (lat - y1) * (x2 - x1) / (y2 - y1) > lon:
                inside = not inside
    return inside


def test_mediterranean_outline_gates() -> None:
    """The outline is only correct as long as its three gates hold.

    It is filled by subtracting the landmass from it, so EVERY sea inside the
    ring turns blue -- including a neighbouring one, the moment a gate slides
    off the strait that separates them.
    """
    preset = places.find_preset("Mediterranean Sea")
    check("mediterranean is drawn from an outline", bool(preset.outline))
    check("an outline has no named parts", preset.parts == ())

    ring = preset.outline
    for label, lon, lat in (
        ("Alboran Sea", -3.5, 36.0),
        ("Balearic Sea", 2.0, 40.0),
        ("Ligurian Sea", 8.9, 43.8),
        ("Tyrrhenian Sea", 12.5, 39.5),
        ("Adriatic Sea", 15.5, 43.0),
        ("Ionian Sea", 18.5, 37.5),
        ("Gulf of Sidra", 18.1, 31.4),
        ("Aegean Sea", 25.0, 39.0),
        ("Sea of Crete", 25.1, 36.3),
        ("Sea of Marmara", 28.1, 40.7),
        ("Levantine basin", 32.0, 33.5),
    ):
        check(f"{label} is inside the outline", _inside_ring(ring, lon, lat))

    for label, lon, lat in (
        ("Atlantic west of Gibraltar", -8.0, 36.0),
        ("Bay of Biscay", -4.0, 45.0),
        ("Black Sea", 34.0, 43.5),
        ("Black Sea west end", 29.0, 42.5),
        ("Red Sea", 35.7, 25.6),
        ("Gulf of Suez", 32.9, 29.0),
        ("Caspian Sea", 50.0, 42.0),
        ("Persian Gulf", 50.0, 27.0),
    ):
        check(f"{label} is outside the outline", not _inside_ring(ring, lon, lat))


def test_outlined_preset_needs_no_lookup() -> None:
    """An outlined sea renders offline: no OSM call, no named-feature lookup."""
    with _Stub() as stub:
        polygons, meta = service._resolve_region("Mediterranean Sea", None, True, "auto")
    check("one ring returned", len(polygons) == 1, str(len(polygons)))
    check("no data source was queried", stub.osm_calls == [], str(stub.osm_calls))
    check("reported as an outline", meta["source"] == "outline", meta["source"])
    check("named under the preset", meta["name"] == "Mediterranean Sea", meta["name"])
    check("asks to be clipped to water", meta["clip_to_water"] is True)
    # Under-land drawing would hide the fill behind the coastline shaping it.
    check("not drawn under the land", meta["marine"] is False)

    with _Stub():
        try:
            service._resolve_region("Mediterranean Sea + Black Sea", None, True, "auto")
            check("an outline cannot be unioned", False, "no error raised")
        except nominatim.GeoLookupError as exc:
            check("an outline cannot be unioned", "outline" in str(exc), str(exc))


def test_clip_to_water_fills_only_water() -> None:
    """The renderer subtracts the landmass from an outline instead of filling it."""
    # A big square of "sea" with a smaller island of land in the middle of it.
    sea = polygons_from_geometry({"type": "Polygon", "coordinates": square(0, 0, 10)})
    island = polygons_from_geometry({"type": "Polygon", "coordinates": square(0, 0, 4)})
    style = style_for_palette("red")

    result = render_card(
        viewport=fit(bounds_of(all_rings(sea)), 240, 240, padding=0.1),
        land_polygons=island,
        border_polygons=[],
        highlight_polygons=sea,
        caption="",
        width=240,
        height=240,
        clip_to_water=True,
        style=style,
    )
    image = Image.open(io.BytesIO(result.png)).convert("RGB")

    def is_highlight(xy):
        # "Reddish" rather than an exact match: the vignette darkens the frame
        # edges, so the fill is never bit-identical to style.highlight.
        r, _, b = image.getpixel(xy)
        return r - b > 40

    check("open water is filled", is_highlight((40, 120)), str(image.getpixel((40, 120))))
    check("the island is not filled", not is_highlight((120, 120)),
          str(image.getpixel((120, 120))))


def test_union_of_places() -> None:
    with _Stub(
        osm={"Aegean Sea": _osm_result("Aegean Sea", feature_type="sea", lon=25, lat=38)},
        named={"Coral Sea": _named_result("Coral Sea", lon=15, lat=36)},
    ):
        polygons, meta = service._resolve_region("Coral Sea + Aegean Sea", None, True, "auto")
    check("both shapes highlighted", len(polygons) == 2, str(len(polygons)))
    check("names joined", meta["name"] == "Coral Sea + Aegean Sea", meta["name"])
    check("mixed sources reported", meta["source"] == "mixed", meta["source"])
    check("all-water union stays marine", meta["marine"] is True)
    check("no single osm id for a union", meta["osm_id"] is None)


def test_union_with_one_land_part_is_not_marine() -> None:
    """One country in the union and under-land drawing would hide the red."""
    with _Stub(
        osm={
            "Aegean Sea": _osm_result("Aegean Sea", feature_type="sea"),
            "Greece": _osm_result("Greece"),
        }
    ):
        _, meta = service._resolve_region("Aegean Sea + Greece", None, True, "auto")
    check("union with land is not marine", meta["marine"] is False)


def test_water_detection_from_osm_type() -> None:
    with _Stub(osm={"Black Sea": _osm_result("Black Sea", feature_type="sea")}):
        _, meta = service._resolve_region("Black Sea", None, True, "auto")
    check("osm sea marked as water", meta["marine"] is True)


def test_unknown_place_raises() -> None:
    with _Stub():
        try:
            service._resolve_region("Nowhere At All", None, True, "auto")
            check("unknown place raises", False, "no error raised")
        except nominatim.GeoLookupError as exc:
            check("unknown place raises", "Natural Earth" in str(exc), str(exc))


def test_invalid_source_rejected() -> None:
    try:
        service._resolve_region("Iceland", None, True, "wikipedia")
        check("invalid source rejected", False, "no error raised")
    except nominatim.GeoLookupError:
        check("invalid source rejected", True)


def test_invalid_osm_id_rejected() -> None:
    for bad in ("9407", "X9407", "", "Rabc"):
        try:
            nominatim.lookup_osm_id(bad)
            check(f"invalid osm id {bad!r} rejected", False, "no error raised")
        except nominatim.GeoLookupError:
            check(f"invalid osm id {bad!r} rejected", True)


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------

def test_request_schema() -> None:
    from app.schemas import GeographyThumbnailRequest

    ok = GeographyThumbnailRequest(place="Iceland", caption="HI")
    check("defaults applied", ok.width == 1280 and ok.height == 720 and ok.source == "auto")
    check("under-land defaults to auto", ok.highlight_under_land is None)
    check("palette defaults to auto", ok.palette == "auto" and ok.seed is None)
    check("theme defaults to auto, font to sans", ok.theme == "auto" and ok.font == "sans")
    for name in ("auto", "red", "blue", "green", "yellow"):
        check(
            f"palette {name} accepted",
            GeographyThumbnailRequest(place="x", palette=name).palette == name,
        )
    for name in ("auto", "dark", "light"):
        check(
            f"theme {name} accepted",
            GeographyThumbnailRequest(place="x", theme=name).theme == name,
        )
    for name in ("sans", "serif"):
        check(
            f"font {name} accepted",
            GeographyThumbnailRequest(place="x", font=name).font == name,
        )

    for payload, label in (
        ({}, "neither place nor osm_id"),
        ({"place": "   "}, "blank place"),
        ({"place": "x", "padding": -1}, "negative padding"),
        ({"place": "x", "width": 10}, "tiny width"),
        ({"place": "x", "width": 99999}, "huge width"),
        ({"place": "x", "source": "wikipedia"}, "unknown source"),
        ({"place": "x", "palette": "chartreuse"}, "unknown palette"),
        ({"place": "x", "palette": "magenta"}, "a palette that was dropped"),
        ({"place": "x", "theme": "dusk"}, "unknown theme"),
        ({"place": "x", "font": "comic"}, "unknown font"),
        ({"place": "x", "seed": -1}, "negative seed"),
    ):
        try:
            GeographyThumbnailRequest(**payload)
            check(f"rejects {label}", False, "no error raised")
        except Exception:
            check(f"rejects {label}", True)


def test_generator_registry() -> None:
    """render_from_spec dispatches by name and rejects malformed specs."""
    from app.thumbnails import generators

    seen = {}

    def fake_geography(spec):
        seen.update(spec)
        return b"PNG"

    # A registry entry is a GeneratorInfo descriptor, not a bare callable, so
    # the stub replaces only its render function.
    original = generators.GENERATORS["geography"]
    generators.GENERATORS["geography"] = replace(original, render=fake_geography)
    try:
        spec = {"generator": "geography", "place": "Iceland", "caption": "HI"}
        check("dispatches to the named generator", generators.render_from_spec(spec) == b"PNG")
        check("passes the whole spec through", seen.get("place") == "Iceland")
    finally:
        generators.GENERATORS["geography"] = original

    for payload, label in (
        ({}, "missing generator"),
        ({"generator": "geograpy", "place": "x"}, "misspelled generator"),
        ("nope", "spec that is not an object"),
    ):
        try:
            generators.render_from_spec(payload)
            check(f"rejects {label}", False, "no error raised")
        except ValueError:
            check(f"rejects {label}", True)

    try:
        generators.render_from_spec({"generator": "geography", "plaec": "Iceland"})
        check("rejects a misspelled spec key", False, "no error raised")
    except ValueError as exc:
        check("rejects a misspelled spec key", "plaec" in str(exc), str(exc))


def test_wide_viewport_does_not_tear_rings() -> None:
    """A ring half a turn from the viewport centre stays in one piece.

    project() unwraps each point on its own, which tears any ring straddling
    the meridian at center_lon +/- 180: half the points land at one edge of the
    canvas and half at the other, drawing the shape as a band straight across
    the map. The tear line sits off-screen on a regional card, so this only
    showed up once a world-scale card (United States, whose Alaska/Hawaii
    spread forces a ~345-degree viewport) came out streaked with grey stripes.
    """
    from app.thumbnails.projection import Viewport, _mercator_y

    # The exact viewport "United States" produces: centred on the Pacific and
    # a hair over 360 degrees wide (Alaska + Hawaii make the subject so tall
    # that fit() grows the horizontal axis past a full turn), which is what
    # pulls the +40E cut meridian on screen -- straight through Russia, the
    # Middle East and East Africa.
    center = -139.97
    viewport = Viewport(
        center_lon=center,
        min_x=-320.08,
        max_x=40.14,
        min_y=_mercator_y(-49.18),
        max_y=_mercator_y(81.05),
        width=1280,
        height=720,
    )
    check("the cut meridian really is inside this viewport",
          viewport.min_x < center + 180 < viewport.max_x,
          f"cut at {center + 180} vs {viewport.min_x}..{viewport.max_x}")

    # A small country sitting right on the cut.
    ring = [[39.0, 10.0], [41.0, 10.0], [41.0, 12.0], [39.0, 12.0], [39.0, 10.0]]
    xs = [x for x, _ in viewport.project_ring(ring)]
    span = max(xs) - min(xs)
    check("a ring on the cut meridian is not smeared across the canvas",
          span < viewport.width / 4, f"x-span {span:.0f}px of {viewport.width}")

    # And a ring that genuinely crosses the antimeridian still stays whole.
    dateline = [[178.0, 10.0], [-178.0, 10.0], [-178.0, 12.0], [178.0, 12.0], [178.0, 10.0]]
    xs = [x for x, _ in viewport.project_ring(dateline)]
    check("an antimeridian-crossing ring is not smeared either",
          max(xs) - min(xs) < viewport.width / 4, f"x-span {max(xs) - min(xs):.0f}px")

    # Points keep their real spacing: unwrapping must not collapse the ring.
    check("the ring keeps a real width", max(xs) - min(xs) > 1.0)


def test_globe_spanning_bounds_are_not_rotated() -> None:
    """A shape going right round the world is bounded as -180..180.

    bounds_of unwraps against its first point, which is right for a shape
    crossing the antimeridian and meaningless for one that never stops
    crossing it: Antarctica came out as -240..119, a full turn parked over the
    Atlantic, which then centred the card on the wrong side of the planet.
    """
    ring = [[lon, -70.0] for lon in range(-180, 181, 10)] + [[-180.0, -85.0]]
    min_lon, _, max_lon, _ = bounds_of([ring])
    check("a globe-spanning ring is bounded -180..180",
          (min_lon, max_lon) == (-180.0, 180.0), f"{min_lon}..{max_lon}")


def _pole_ring(lat: float, step: int = 10) -> list:
    """A ring circling a pole at one latitude."""
    return [[float(lon), lat] for lon in range(-180, 181, step)]


def test_polar_subjects_are_detected() -> None:
    """Only a subject that circles a pole gets the polar projection."""
    from app.thumbnails.projection import polar_hemisphere

    check("a ring round the south pole is south",
          polar_hemisphere([_pole_ring(-70.0)]) == "south")
    check("a ring round the north pole is north",
          polar_hemisphere([_pole_ring(75.0)]) == "north")
    # Coverage is measured along the edges, not at the vertices: Natural
    # Earth's Arctic Ocean circles the pole in 764 points that land in only 22
    # of the 36 longitude buckets, and a vertex-only count called it Mercator.
    check("a coarse ring round the pole is still polar",
          polar_hemisphere([_pole_ring(75.0, step=60)]) == "north")
    # Everything that merely reaches far north, or merely spans a lot of
    # longitude, has to stay on Mercator.
    russia = [[19.0, 45.0], [190.0, 45.0], [190.0, 82.0], [19.0, 82.0], [19.0, 45.0]]
    check("a wide northern country is not polar", polar_hemisphere([russia]) is None)
    check("a globe-spanning tropical band is not polar",
          polar_hemisphere([_pole_ring(10.0)]) is None)
    check("a small region is not polar",
          polar_hemisphere([[[10.0, 40.0], [12.0, 40.0], [12.0, 42.0], [10.0, 40.0]]]) is None)


def test_fit_subject_picks_the_projection() -> None:
    from app.thumbnails.projection import PolarViewport, Viewport, fit_subject

    polar = fit_subject([_pole_ring(-70.0)], 1280, 720)
    check("a polar subject gets a polar viewport", isinstance(polar, PolarViewport))
    iceland = [[-24.0, 63.0], [-13.0, 63.0], [-13.0, 66.0], [-24.0, 66.0], [-24.0, 63.0]]
    check("an ordinary subject stays on Mercator",
          isinstance(fit_subject([iceland], 1280, 720), Viewport))


def test_polar_projection_keeps_a_pole_subject_whole() -> None:
    """The failure Mercator cannot avoid: Antarctica as a band across the card.

    Mercator stops at 85 degrees and stretches what is left sideways, so the
    continent came out as a smear the full width of the frame with a straight
    line where the clamp cut it. On the polar view it is a compact shape and
    the pole is an ordinary point in the middle of it.
    """
    from app.thumbnails.projection import fit_subject

    coast = _pole_ring(-70.0, step=5)
    viewport = fit_subject([coast], 1280, 720, padding=0.3)
    points = viewport.project_ring(coast)
    xs = [x for x, _ in points]
    ys = [y for _, y in points]
    check("the coastline does not span the whole canvas",
          max(xs) - min(xs) < viewport.width * 0.95,
          f"x-span {max(xs) - min(xs):.0f}px of {viewport.width}")
    check("the coastline is as tall as it is wide (a ring, not a band)",
          abs((max(xs) - min(xs)) - (max(ys) - min(ys))) < 2.0,
          f"{max(xs) - min(xs):.1f} x {max(ys) - min(ys):.1f}")

    # Every point of a constant-latitude ring is the same distance from the
    # pole. That is the property Mercator loses and the whole reason for this
    # projection.
    pole_x, pole_y = viewport.project(0.0, -90.0)
    radii = [math.hypot(x - pole_x, y - pole_y) for x, y in points]
    check("a constant latitude is a circle round the pole",
          max(radii) - min(radii) < 1.0, f"radii {min(radii):.1f}..{max(radii):.1f}")
    check("the pole is on the canvas",
          0 < pole_x < viewport.width and 0 < pole_y < viewport.height,
          f"pole at {pole_x:.0f},{pole_y:.0f}")
    # The caption banner is centred at 0.755 of the height; the subject has to
    # clear it, because a polar subject is a blob whose bottom carries as much
    # of its shape as its top.
    check("the subject stays above the caption banner",
          max(ys) < viewport.height * 0.66, f"lowest point at {max(ys):.0f}px")

    inner = viewport.project_ring(_pole_ring(-80.0, step=5))
    inner_radii = [math.hypot(x - pole_x, y - pole_y) for x, y in inner]
    check("a higher latitude sits closer to the pole", max(inner_radii) < min(radii))


def test_viewports_scale_together() -> None:
    """Supersampling doubles the canvas, so it has to double the coordinates."""
    from app.thumbnails.projection import fit_subject

    iceland = [[-24.0, 63.0], [-13.0, 63.0], [-13.0, 66.0], [-24.0, 66.0], [-24.0, 63.0]]
    for label, rings, lon, lat in (
        ("mercator", [iceland], -18.0, 64.0),
        ("polar", [_pole_ring(-70.0)], 30.0, -75.0),
    ):
        viewport = fit_subject(rings, 640, 360)
        big = viewport.scaled(3)
        x, y = viewport.project(lon, lat)
        big_x, big_y = big.project(lon, lat)
        check(f"{label} scaled(3) is the same view three times bigger",
              abs(big_x - 3 * x) < 0.01 and abs(big_y - 3 * y) < 0.01,
              f"{x:.2f},{y:.2f} -> {big_x:.2f},{big_y:.2f}")
        check(f"{label} scaled(3) reports the bigger canvas",
              (big.width, big.height) == (1920, 1080))


def test_catalog() -> None:
    """The descriptors are complete and their examples really are valid."""
    from app.thumbnails.catalog import TYPES, catalog_json, catalog_markdown, validate_spec
    from app.thumbnails.generators import GENERATORS

    for name, info in GENERATORS.items():
        check(f"{name} is keyed by its own name", info.name == name)
        check(f"{name} says when to use it", bool(info.when_to_use and info.when_not_to_use))
        check(f"{name} renders something", callable(info.render))
        for param in info.params:
            check(f"{name}.{param.name} is described", bool(param.description))
            check(f"{name}.{param.name} has a known type", param.type in TYPES)
        check(f"{name} has examples", bool(info.examples))
        for example in info.examples:
            # The examples double as the prompt's worked cases, so an example
            # the validator would reject is a bug that teaches the model wrong.
            check(f"{name} example {example.get('place')} validates",
                  validate_spec(info, example) == [], str(validate_spec(info, example)))

    payload = catalog_json(GENERATORS)
    check("catalog is JSON-serializable", isinstance(json.dumps(payload), str))
    check("catalog omits the render callable", all("render" not in entry for entry in payload))

    doc = catalog_markdown(GENERATORS)
    check("doc names every generator", all(f"`{name}`" in doc for name in GENERATORS))
    check("doc carries the natural_earth trap", "natural_earth" in doc and "Sahara" in doc)


def test_validate_spec() -> None:
    """Every kind of bad value is reported, and all of them at once."""
    from app.thumbnails.catalog import validate_spec
    from app.thumbnails.generators import GENERATORS

    info = GENERATORS["geography"]
    good = {"generator": "geography", "place": "Iceland", "caption": "HI", "palette": "blue"}
    check("a good spec has no errors", validate_spec(info, good) == [])
    check("osm_id satisfies the requirement too",
          validate_spec(info, {"generator": "geography", "osm_id": "R9407"}) == [])

    for payload, needle, label in (
        ({"place": "x", "plaec": "y"}, "plaec", "unknown key"),
        ({"place": "x", "palette": "chartreuse"}, "palette", "unknown palette"),
        ({"place": "x", "source": "wikipedia"}, "source", "unknown source"),
        ({"place": "x", "padding": -1}, "padding", "padding below the minimum"),
        ({"place": "x", "width": 99999}, "width", "width above the maximum"),
        ({"place": "x", "seed": True}, "seed", "a bool where an integer belongs"),
        ({"place": "x", "caption": 7}, "caption", "a number where a string belongs"),
        ({"place": "x", "uppercase": "yes"}, "uppercase", "a string where a bool belongs"),
        ({}, "place", "neither place nor osm_id"),
        ({"place": "   "}, "place", "a blank place"),
    ):
        errors = validate_spec(info, dict(payload, generator="geography"))
        check(f"reports {label}", any(needle in error for error in errors), str(errors))

    many = validate_spec(info, {"generator": "geography", "palette": "chartreuse", "padding": -1})
    check("reports every problem at once, not just the first", len(many) >= 3, str(many))


def test_digest_post() -> None:
    """A post JSON dict and a Post row both digest, small and without markup."""
    from app.thumbnails.suggest import DIGEST_BUDGET, digest_post

    post = {
        "tags": ["geology", "oceans"],
        "feed_card": {"headline": "The Mediterranean dried up.", "teasers": ["The salt"]},
        "sections": [
            {"type": "headline", "content": "The Mediterranean dried up."},
            {"type": "see_it", "visual_svg": "<svg>" + "x" * 5000 + "</svg>"},
            {"type": "tangible", "content": ["It took 600,000 years."]},
        ],
    }
    text = digest_post(post, "facts")
    check("digest names the format", "format: facts" in text)
    check("digest carries the tags", "geology" in text)
    check("digest carries the headline", "Mediterranean" in text)
    check("digest carries later prose", "600,000" in text)
    check("digest leaves out the SVG", "<svg" not in text and "xxxx" not in text)
    check("digest stays within budget", len(text) <= DIGEST_BUDGET + 200, str(len(text)))

    class FakePost:
        format = "facts"
        tags = ["geology"]
        feed_card = {"headline": "A row, not a dict."}
        sections = []

    row = digest_post(FakePost())
    check("a Post row digests the same way", "format: facts" in row and "A row" in row)


def test_suggest_thumbnail_spec() -> None:
    """The reply is validated, retried once, and 'no generator' is a valid answer."""
    from app.thumbnails import suggest
    from app.thumbnails.suggest import SuggestionError, suggest_thumbnail_spec

    post = {"tags": ["oceans"], "feed_card": {"headline": "The Mediterranean dried up."}}
    replies = []
    asked = []
    briefed = []

    def fake_chat_json(system, user, model=None, temperature=0.0):
        asked.append(user)
        briefed.append(system)
        return replies.pop(0)

    original = suggest.kiconnect.chat_json
    suggest.kiconnect.chat_json = fake_chat_json
    try:
        replies[:] = [{"generator": "geography",
                       "spec": {"generator": "geography", "place": "Mediterranean Sea",
                                "palette": "blue"},
                       "reason": "It is about that sea."}]
        result = suggest_thumbnail_spec(post, "facts")
        check("accepts a valid spec", result.fits and result.spec["place"] == "Mediterranean Sea")
        check("the catalog and its rules reach the model",
              "geography" in briefed[0] and "natural_earth" in briefed[0])
        check("declining is offered to the model", "null" in briefed[0])
        check("the post itself reaches the model", "Mediterranean" in asked[0])

        replies[:] = [{"generator": None, "spec": None, "reason": "No place in it."}]
        result = suggest_thumbnail_spec(post, "facts")
        check("declining is a valid answer, not an error",
              not result.fits and result.spec is None and "No place" in result.reason)

        # The generator name is repeated inside the spec; a model that forgets
        # gets it filled in rather than bounced.
        replies[:] = [{"generator": "geography", "spec": {"place": "Iceland"}, "reason": "x"}]
        result = suggest_thumbnail_spec(post, "facts")
        check("fills in a missing spec.generator", result.spec["generator"] == "geography")

        replies[:] = [
            {"generator": "geography", "spec": {"generator": "geography", "place": "x",
                                                "palette": "chartreuse"}, "reason": "x"},
            {"generator": "geography", "spec": {"generator": "geography", "place": "x",
                                                "palette": "blue"}, "reason": "fixed"},
        ]
        result = suggest_thumbnail_spec(post, "facts")
        check("retries once with the errors", result.fits and result.spec["palette"] == "blue")
        check("the retry shows the model what was wrong", "chartreuse" in asked[-1])

        bad = {"generator": "geography",
               "spec": {"generator": "geography", "place": "x", "palette": "chartreuse"},
               "reason": "x"}
        replies[:] = [bad, bad]
        try:
            suggest_thumbnail_spec(post, "facts")
            check("gives up after the second bad spec", False, "no error raised")
        except SuggestionError as exc:
            check("gives up after the second bad spec", "palette" in str(exc), str(exc))

        replies[:] = [{"generator": "sattelite", "spec": {}, "reason": "x"},
                      {"generator": None, "spec": None, "reason": "nothing fits"}]
        result = suggest_thumbnail_spec(post, "facts")
        check("an invented generator is corrected, not rendered", not result.fits)

        replies[:] = ["not an object", "still not an object"]
        try:
            suggest_thumbnail_spec(post, "facts")
            check("rejects a non-object reply", False, "no error raised")
        except SuggestionError:
            check("rejects a non-object reply", True)
    finally:
        suggest.kiconnect.chat_json = original


def test_kiconnect_json_extraction() -> None:
    """Fenced and chatty replies still parse; a missing key is a clear error."""
    from app import kiconnect

    check("bare JSON parses", kiconnect._extract_json('{"a": 1}') == '{"a": 1}')
    check("a fenced block parses",
          json.loads(kiconnect._extract_json('```json\n{"a": 1}\n```')) == {"a": 1})
    check("a fence with no language tag parses",
          json.loads(kiconnect._extract_json('```\n{"a": 1}\n```')) == {"a": 1})
    check("prose around the object is dropped",
          json.loads(kiconnect._extract_json('Sure! {"a": 1} Hope that helps.')) == {"a": 1})

    original = kiconnect.API_KEY
    kiconnect.API_KEY = ""
    try:
        kiconnect.chat("s", "u", model="X")
        check("a missing key is a clear error", False, "no error raised")
    except kiconnect.KiConnectError as exc:
        check("a missing key is a clear error", "KICONNECT_API_KEY" in str(exc))
    finally:
        kiconnect.API_KEY = original

    original_model = kiconnect.MODEL
    kiconnect.API_KEY = "test-key"
    kiconnect.MODEL = ""
    try:
        kiconnect.chat("s", "u")
        check("a missing model is a clear error", False, "no error raised")
    except kiconnect.KiConnectError as exc:
        check("a missing model is a clear error", "KICONNECT_MODEL" in str(exc))
    finally:
        kiconnect.API_KEY = original
        kiconnect.MODEL = original_model


def test_thumbnail_storage() -> None:
    """Path carries a content hash, and a missing Supabase client is a clear error."""
    from app import thumbnail_storage

    png = b"\x89PNG-one"
    other = b"\x89PNG-two"
    path = thumbnail_storage.thumbnail_path(png, "sahara-is-growing")
    check("path is namespaced and named after the post",
          path.startswith("thumbnails/sahara-is-growing-") and path.endswith(".png"), path)
    check("same bytes -> same path", thumbnail_storage.thumbnail_path(png, "a")
          == thumbnail_storage.thumbnail_path(png, "a"))
    check("different bytes -> different path (no stale CDN copy)",
          thumbnail_storage.thumbnail_path(other, "a") != thumbnail_storage.thumbnail_path(png, "a"))

    class FakeBucket:
        def __init__(self):
            self.uploaded = None

        def upload(self, path, file, file_options):
            self.uploaded = (path, file, file_options)

        def get_public_url(self, path):
            return f"https://example.supabase.co/storage/v1/object/public/uploads/{path}"

    class FakeStorage:
        def __init__(self, bucket):
            self.bucket = bucket

        def from_(self, name):
            return self.bucket

    class FakeClient:
        def __init__(self, bucket):
            self.storage = FakeStorage(bucket)

    bucket = FakeBucket()
    original = thumbnail_storage.supabase_client
    thumbnail_storage.supabase_client = FakeClient(bucket)
    try:
        url = thumbnail_storage.upload_thumbnail_png(png, "post-7")
    finally:
        thumbnail_storage.supabase_client = original
    check("uploads to the hashed path",
          bucket.uploaded[0] == thumbnail_storage.thumbnail_path(png, "post-7"))
    check("uploads as a PNG", bucket.uploaded[2]["content-type"] == "image/png")
    check("upserts so an unchanged re-run is a no-op", bucket.uploaded[2]["upsert"] == "true")
    check("returns the public URL", url.endswith(bucket.uploaded[0]), url)

    thumbnail_storage.supabase_client = None
    try:
        thumbnail_storage.upload_thumbnail_png(png, "post-7")
        check("unconfigured storage raises", False, "no error raised")
    except RuntimeError:
        check("unconfigured storage raises", True)
    finally:
        thumbnail_storage.supabase_client = original


# ---------------------------------------------------------------------------
# The mental card (app/thumbnails/figures.py, app/thumbnails/mental.py)
#
# Every test below builds its own synthetic artwork in a temp directory rather
# than loading the real renders: the point is the compositing rules, and a test
# that fails because someone re-exported a head is a test nobody trusts.
# ---------------------------------------------------------------------------


def _figure_assets(directory, glass_alpha: int = 110):
    """A minimal angle: a tall "head", a smaller "brain" inside it, and a
    translucent copy of the head. Shapes are rectangles, so every expected
    bounding box below is exact rather than approximate."""
    from PIL import Image, ImageDraw

    size = (200, 120)
    head_box = (40, 10, 160, 119)
    brain_box = (70, 25, 130, 70)

    def canvas(box, fill):
        image = Image.new("RGBA", size, (0, 0, 0, 0))
        ImageDraw.Draw(image).rectangle(box, fill=fill)
        return image

    directory.mkdir(parents=True, exist_ok=True)
    # Mid grey, so a normalising tint has room to move it in both directions.
    canvas(head_box, (150, 150, 150, 255)).save(directory / "head.png")
    canvas(head_box, (230, 230, 230, glass_alpha)).save(directory / "head_glass.png")
    canvas(brain_box, (200, 120, 130, 255)).save(directory / "brain.png")
    return head_box, brain_box


def _with_assets(body, glass_alpha: int = 110):
    """Run `body(head_box, brain_box)` against a temp asset directory."""
    import tempfile
    from pathlib import Path

    from app.thumbnails import figures

    original = figures.ASSET_ROOT
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        boxes = _figure_assets(root / "side", glass_alpha)
        (root / "angles.json").write_text('{"side": "a made-up view"}', encoding="utf-8")
        figures.ASSET_ROOT = root
        figures.reset_cache()
        try:
            return body(*boxes)
        finally:
            figures.ASSET_ROOT = original
            figures.reset_cache()


def test_figure_assets_are_discovered() -> None:
    """An angle offers exactly the motifs it has every layer for."""
    from app.thumbnails import figures

    def body(head_box, brain_box):
        check("finds the angle", figures.angle_names() == ("side",))
        check("reads angles.json", figures.angle_descriptions()["side"] == "a made-up view")
        check(
            "offers every motif when all three layers are there",
            set(figures.motifs_for("side")) == {"head", "brain", "brain_in_head"},
        )

        # Take the shell away: the overlay motif has to disappear with it,
        # rather than raising from inside the renderer later on.
        (figures.ASSET_ROOT / "side" / "head_glass.png").unlink()
        figures.reset_cache()
        check(
            "drops the motif whose layer is missing",
            set(figures.motifs_for("side")) == {"head", "brain"},
        )
        check("brain_in_head has no angle left", figures.angles_for("brain_in_head") == ())

    _with_assets(body)


def test_motif_framing_uses_the_shared_bounding_box() -> None:
    """brain_in_head is framed on the HEAD, not on the brain.

    This is the whole alignment contract. Cropping each layer to its own
    content would centre the brain in the card and slide the skull off it; the
    union box keeps the brain exactly where the 3D camera put it.
    """
    from app.thumbnails import figures

    def body(head_box, brain_box):
        head_size = (head_box[2] - head_box[0] + 1, head_box[3] - head_box[1] + 1)
        brain_size = (brain_box[2] - brain_box[0] + 1, brain_box[3] - brain_box[1] + 1)
        box = (400, 400)

        head = figures.compose("head", "side", box, {})
        overlay = figures.compose("brain_in_head", "side", box, {})
        brain = figures.compose("brain", "side", box, {})

        check(
            "the overlay is framed exactly like the head alone",
            head.size == overlay.size,
            f"{head.size} vs {overlay.size}",
        )
        check(
            "the head keeps its aspect ratio",
            abs(head.width / head.height - head_size[0] / head_size[1]) < 0.02,
        )
        check(
            "the brain alone is framed on itself, not on the head",
            abs(brain.width / brain.height - brain_size[0] / brain_size[1]) < 0.02,
        )

        # The brain must sit strictly inside the shell in the composed image --
        # a per-layer crop would push it to the edges.
        scale = overlay.width / head_size[0]
        expected_left = round((brain_box[0] - head_box[0]) * scale)
        opaque = overlay.getchannel("A").point(lambda value: 255 if value > 200 else 0)
        bounds = opaque.getbbox()
        check(
            "the brain lands where the camera put it",
            bounds is not None and abs(bounds[0] - expected_left) <= 2,
            f"{bounds} expected left ~{expected_left}",
        )

    _with_assets(body)


def test_figure_fits_the_box_without_distorting() -> None:
    """compose() scales to the tighter axis, so nothing is stretched."""
    from app.thumbnails import figures

    def body(head_box, brain_box):
        for box in ((400, 400), (1000, 120), (90, 900)):
            figure = figures.compose("head", "side", box, {})
            check(
                f"stays inside {box}",
                figure.width <= box[0] and figure.height <= box[1],
                str(figure.size),
            )
            check(
                f"fills one axis of {box}",
                figure.width == box[0] or figure.height == box[1],
                str(figure.size),
            )

    _with_assets(body)


def test_tint_normalises_before_colouring() -> None:
    """A pale render must still reach the dark end of the ramp.

    Without normalising, the result depends on how bright the 3D render
    happened to be lit -- the real brain sat high enough in the range that a
    red card came out pink.
    """
    from PIL import Image, ImageDraw

    from app.thumbnails.figures import tint

    # A washed-out gradient: nothing in it is darker than 180.
    pale = Image.new("RGBA", (100, 20), (0, 0, 0, 0))
    draw = ImageDraw.Draw(pale)
    for x in range(100):
        value = 180 + x // 4
        draw.line([(x, 0), (x, 19)], fill=(value, value, value, 255))

    shade, light = (100, 0, 0), (255, 160, 160)
    plain = tint(pale, shade, light, normalize=False)
    stretched = tint(pale, shade, light, normalize=True)

    darkest_plain = min(pixel[0] for pixel in plain.convert("RGB").getdata())
    darkest_stretched = min(pixel[0] for pixel in stretched.convert("RGB").getdata())
    check(
        "un-normalised stays bunched at the light end",
        darkest_plain > 200,
        str(darkest_plain),
    )
    check(
        "normalised reaches the dark end of the ramp",
        darkest_stretched <= shade[0] + 12,
        str(darkest_stretched),
    )

    # The surround must not drag the black point down: it is transparent, and
    # its RGB is whatever the exporter left there.
    with_surround = Image.new("RGBA", (140, 20), (0, 0, 0, 0))
    with_surround.paste(pale, (20, 0))
    masked = tint(with_surround, shade, light, normalize=True)
    figure_only = [
        pixel[0]
        for pixel, alpha in zip(masked.convert("RGB").getdata(), masked.getchannel("A").getdata())
        if alpha
    ]
    check(
        "normalising measures the figure, not the transparent surround",
        abs(min(figure_only) - darkest_stretched) <= 2,
        f"{min(figure_only)} vs {darkest_stretched}",
    )


def test_tint_keeps_the_alpha_channel() -> None:
    """Recolouring must not turn a translucent shell opaque."""
    from PIL import Image

    from app.thumbnails.figures import tint

    image = Image.new("RGBA", (10, 10), (200, 200, 200, 90))
    result = tint(image, (0, 0, 40), (200, 200, 255))
    check("alpha survives the tint", result.getchannel("A").getextrema() == (90, 90))


def test_white_backdrop_is_keyed_from_the_edge_only() -> None:
    """A layer exported without alpha is rescued; an enclosed bright area is not
    punched out with the backdrop, and the shell is refused outright."""
    import tempfile
    from pathlib import Path

    from PIL import Image, ImageDraw

    from app.thumbnails import figures

    original = figures.ASSET_ROOT
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp) / "side"
        root.mkdir(parents=True)

        # A grey blob on white, with a white "highlight" inside it. Saved as
        # RGB, so it arrives with no alpha at all.
        opaque = Image.new("RGB", (100, 100), (255, 255, 255))
        draw = ImageDraw.Draw(opaque)
        draw.rectangle((20, 20, 79, 79), fill=(140, 140, 140))
        draw.rectangle((40, 40, 59, 59), fill=(255, 255, 255))
        opaque.save(root / "head.png")
        opaque.save(root / "brain.png")
        opaque.save(root / "head_glass.png")

        figures.ASSET_ROOT = Path(temp)
        figures.reset_cache()
        try:
            head = figures.load_layer("side", "head")
            alpha = head.getchannel("A")
            check("the backdrop is keyed out", alpha.getpixel((5, 5)) == 0)
            check("the figure is kept", alpha.getpixel((25, 25)) == 255)
            check(
                "an enclosed highlight is not punched through",
                alpha.getpixel((50, 50)) == 255,
            )
            try:
                figures.load_layer("side", "head_glass")
                check("an opaque shell is refused", False, "no error raised")
            except figures.FigureError as exc:
                check("an opaque shell is refused", "alpha channel" in str(exc), str(exc))
        finally:
            figures.ASSET_ROOT = original
            figures.reset_cache()


def test_mental_card_is_grey_except_the_figure() -> None:
    """The single-colour rule: the field behind the figure carries no palette."""
    import io

    from PIL import Image

    from app.thumbnails.mental import render_mental_thumbnail

    def body(head_box, brain_box):
        result = render_mental_thumbnail(
            motif="head", caption="ONE COLOUR", angle="side",
            palette="red", theme="dark", seed=1,
        )
        card = Image.open(io.BytesIO(result.png)).convert("RGB")

        corner = card.getpixel((6, 6))
        check(
            "the corner of the field is grey",
            max(corner) - min(corner) <= 6,
            str(corner),
        )
        red, green, blue = card.getpixel((card.width // 2, round(card.height * 0.25)))
        check("the figure carries the palette", red > green + 25 and red > blue + 25,
              str((red, green, blue)))

    _with_assets(body)


def test_figure_shadow_reaches_past_the_silhouette() -> None:
    """The contact shadow must spread outside the figure, not stop at its edge.

    A composed figure touches all four sides of its own bounding box by
    definition -- that is what the union crop produces -- so blurring its
    silhouette in place clipped the shadow off square and drew a faint
    rectangle around the head. Measured on the helper rather than on a finished
    card: the card's own gradient is smooth enough to hide a step of two grey
    levels, which is all the bug was worth in absolute terms and still plainly
    visible as a straight line.
    """
    from PIL import Image

    from app.thumbnails.mental import _draw_figure_shadow
    from app.thumbnails.render import build_style

    style = build_style("red", "light")
    canvas = Image.new("RGB", (400, 400), (255, 255, 255))
    figure = Image.new("RGBA", (120, 120), (0, 0, 0, 255))

    _draw_figure_shadow(canvas, figure, (140, 140), style)

    # Just outside the silhouette on the left, level with its middle. The bar
    # is "any shadow at all": clipped to the bounding box this pixel is pure
    # white, and the light theme only puts the shadow at 0.19 opacity to begin
    # with, so a threshold tuned to how DARK it is would be tuned to nothing.
    outside = canvas.getpixel((137, 200))
    check(
        "the shadow spreads sideways past the figure",
        max(outside) < 250,
        str(outside),
    )
    # Upwards it is weaker still, because the whole shadow is dropped 3% of the
    # figure height downwards first.
    above = canvas.getpixel((200, 138))
    check("the shadow spreads above the figure", max(above) < 255, str(above))
    # And it has to fade rather than end: sample outwards and require the
    # darkening to shrink monotonically, with no step back to pure white.
    ramp = [255 - max(canvas.getpixel((140 - offset, 200))) for offset in range(1, 12)]
    check("the shadow is darkest against the figure", ramp[0] == max(ramp), str(ramp))
    check("the shadow fades outwards", ramp[-1] < ramp[0], str(ramp))
    check(
        "the shadow has no hard end",
        all(ramp[i] >= ramp[i + 1] for i in range(len(ramp) - 1)),
        str(ramp),
    )


def test_glow_ramp_reaches_zero_at_its_edge() -> None:
    """The glow must leave the field untouched outside its own box."""
    from PIL import Image

    from app.thumbnails.mental import GLOW_SPREAD, _draw_glow
    from app.thumbnails.render import build_style

    style = build_style("red", "dark")
    field = style.ocean
    canvas = Image.new("RGB", (600, 600), field)
    figure = Image.new("RGBA", (200, 200), (0, 0, 0, 255))
    _draw_glow(canvas, figure, (200, 200), style)

    span = round(200 * GLOW_SPREAD)
    left = 200 + 100 - span // 2
    check("the field outside the glow box is untouched",
          canvas.getpixel((left - 2, 300)) == field, str(canvas.getpixel((left - 2, 300))))
    check("the glow starts from nothing at its edge",
          canvas.getpixel((left + 1, 300)) == field, str(canvas.getpixel((left + 1, 300))))
    check("the glow is actually drawn in the middle",
          canvas.getpixel((300, 300)) != field)


def test_mental_auto_choices_are_stable_and_spread() -> None:
    """auto palette, theme and angle must be derived, not random: the stored
    filename carries a content hash, so a card that moved per render would
    orphan a fresh image in storage every time."""
    from app.thumbnails import figures
    from app.thumbnails.mental import _resolve_angle

    def body(head_box, brain_box):
        # A second angle, so "auto" has something to choose between.
        _figure_assets(figures.ASSET_ROOT / "front")
        figures.reset_cache()

        first = _resolve_angle("auto", "head", "head|Habits beat willpower")
        again = _resolve_angle("auto", "head", "head|Habits beat willpower")
        check("the same subject always picks the same angle", first == again)

        picked = {
            _resolve_angle("auto", "head", f"head|caption number {n}") for n in range(40)
        }
        check("auto spreads across the angles", picked == {"side", "front"}, str(picked))

        check("an explicit angle is honoured", _resolve_angle("front", "head", "x") == "front")

        try:
            _resolve_angle("nope", "head", "x")
            check("an unknown angle is rejected", False, "no error raised")
        except figures.FigureError as exc:
            check("an unknown angle is rejected", "angles that can" in str(exc), str(exc))

    _with_assets(body)


def test_mental_reports_a_motif_it_cannot_draw() -> None:
    """A missing layer must name the problem, not fail deep in Pillow."""
    from app.thumbnails import figures
    from app.thumbnails.mental import render_mental_thumbnail

    def body(head_box, brain_box):
        (figures.ASSET_ROOT / "side" / "brain.png").unlink()
        figures.reset_cache()
        try:
            render_mental_thumbnail(motif="brain_in_head", caption="X", angle="auto")
            check("a motif with no artwork is refused", False, "no error raised")
        except figures.FigureError as exc:
            check(
                "a motif with no artwork is refused",
                "brain_in_head" in str(exc) and "head" in str(exc),
                str(exc),
            )

    _with_assets(body)


def main() -> int:
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_")]
    for test in tests:
        test()
    print(f"\n{PASS} checks passed across {len(tests)} tests.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
