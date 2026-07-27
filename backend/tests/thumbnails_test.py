"""Tests for the geography thumbnail generator (backend/app/thumbnails/).

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
- All four colour profiles, including yellow's flipped (dark) caption text.
- The "+" union and the OSM -> Natural Earth fallback, with both data sources
  stubbed so the suite never touches the network.
- Request schema validation.

Nothing here downloads a basemap or calls Nominatim.

Run with: venv\\Scripts\\python.exe tests\\thumbnails_test.py
"""

import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image  # noqa: E402

from app.thumbnails import basemap, nominatim, service  # noqa: E402
from app.thumbnails.geometry import all_rings, polygons_from_geometry  # noqa: E402
from app.thumbnails.projection import bounds_of, fit  # noqa: E402
from app.thumbnails.render import (  # noqa: E402
    PALETTES,
    PaletteError,
    Style,
    render_card,
    style_for_palette,
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
):
    """A tiny synthetic scene: one land square with a highlight square on it.

    The seed is pinned so the caption's random tilt and offset cannot make a
    test flaky; the tests that care about the jitter vary it themselves.
    """
    style = style_for_palette(palette)
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


def test_yellow_flips_the_caption_to_dark_text() -> None:
    """White on yellow is unreadable, so that profile inverts the text."""
    check("yellow text is dark", sum(PALETTES["yellow"].text) < 200)
    for name in ("red", "blue", "green"):
        check(f"{name} text is light", sum(PALETTES[name].text) > 600)


def test_palette_leaves_the_map_grey() -> None:
    """Only the marked region gets colour; the basemap is grey in every profile."""
    for name in PALETTES:
        _, image, style = _render(False, "TEST", palette=name)
        check(f"{name}: ocean unchanged", _close(image.getpixel((640, 60)), style.ocean))
        # Inside the land square (y 120..600) but outside the highlight (240..480).
        check(f"{name}: land unchanged", _close(image.getpixel((640, 180)), style.land))


def test_unknown_palette_rejected() -> None:
    for bad in ("purple", "  ", "rot"):
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
    """OSM has no polygon for a sea, so the marine layer answers instead."""
    with _Stub(named={"Mediterranean Sea": _named_result("Mediterranean Sea")}) as stub:
        _, meta = service._resolve_region("Mediterranean Sea", None, True, "auto")
    check("fell back to natural earth", meta["source"] == "natural_earth", meta["source"])
    check("osm was tried first", stub.osm_calls == ["Mediterranean Sea"], str(stub.osm_calls))
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


def test_union_of_places() -> None:
    with _Stub(
        osm={"Aegean Sea": _osm_result("Aegean Sea", feature_type="sea", lon=25, lat=38)},
        named={"Mediterranean Sea": _named_result("Mediterranean Sea", lon=15, lat=36)},
    ):
        polygons, meta = service._resolve_region(
            "Mediterranean Sea + Aegean Sea", None, True, "auto"
        )
    check("both shapes highlighted", len(polygons) == 2, str(len(polygons)))
    check("names joined", meta["name"] == "Mediterranean Sea + Aegean Sea", meta["name"])
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
    check("palette defaults to red", ok.palette == "red" and ok.seed is None)
    for name in ("red", "blue", "green", "yellow"):
        check(
            f"palette {name} accepted",
            GeographyThumbnailRequest(place="x", palette=name).palette == name,
        )

    for payload, label in (
        ({}, "neither place nor osm_id"),
        ({"place": "   "}, "blank place"),
        ({"place": "x", "padding": -1}, "negative padding"),
        ({"place": "x", "width": 10}, "tiny width"),
        ({"place": "x", "width": 99999}, "huge width"),
        ({"place": "x", "source": "wikipedia"}, "unknown source"),
        ({"place": "x", "palette": "purple"}, "unknown palette"),
        ({"place": "x", "seed": -1}, "negative seed"),
    ):
        try:
            GeographyThumbnailRequest(**payload)
            check(f"rejects {label}", False, "no error raised")
        except Exception:
            check(f"rejects {label}", True)


def main() -> int:
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_")]
    for test in tests:
        test()
    print(f"\n{PASS} checks passed across {len(tests)} tests.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
