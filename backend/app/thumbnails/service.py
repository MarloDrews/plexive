"""One call from "Mediterranean Sea" + a caption to a finished PNG."""

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from . import basemap
from .geometry import Polygon, all_rings, polygons_from_geometry
from .nominatim import GeoLookupError, lookup_osm_id, lookup_place
from .projection import bounds_of, fit
from .render import (
    DEFAULT_PALETTE,
    PALETTES,
    RenderResult,
    Style,
    render_card,
    style_for_palette,
)

logger = logging.getLogger("app.thumbnails")

DEFAULT_WIDTH = 1280
DEFAULT_HEIGHT = 720

# Splits a place into parts that get highlighted together, e.g.
# "Mediterranean Sea + Adriatic Sea + Aegean Sea".
UNION_SEPARATOR = "+"

# OSM feature types that mean "this is water", so the highlight should be drawn
# under the landmass. Checked against the `type` Nominatim reports.
WATER_FEATURE_TYPES = frozenset(
    {"sea", "ocean", "water", "bay", "strait", "lagoon", "gulf", "sound", "reef"}
)

# Which dataset to highlight from.
#   auto          OSM first, Natural Earth if OSM has no fillable area
#   osm           OSM only
#   natural_earth Natural Earth only
#
# The override exists because OSM's geocoder is built for addresses and
# mis-picks physical regions badly: "Sahara" returns a village in India,
# "Andes" a town in New York. Both are real, fillable areas, so nothing
# downstream can tell they are wrong -- only the caller knows it meant the
# desert. natural_earth is the right choice for deserts, mountain ranges,
# rainforests and oceans; auto is right for anything with a border.
SOURCES = ("auto", "osm", "natural_earth")

# Colour profiles for the marked region + banner. Everything else stays grey.
PALETTE_NAMES = tuple(sorted(PALETTES))


@dataclass
class Thumbnail:
    png: bytes
    width: int
    height: int
    # What was actually matched. Worth returning: free-text search picks the
    # wrong "Georgia" often enough that the caller needs to see the choice, and
    # the osm_id can then be pinned.
    place_name: str
    osm_type: Optional[str]
    osm_id: Optional[int]
    caption_lines: List[str]
    # "osm", "natural_earth", or "mixed" -- where the highlighted shape(s) came from.
    source: str = "osm"
    # Which colour profile was used, echoed back for the same reason as source.
    palette: str = DEFAULT_PALETTE


def render_geography_thumbnail(
    place: Optional[str] = None,
    osm_id: Optional[str] = None,
    caption: str = "",
    padding: float = 0.35,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    uppercase: bool = True,
    highlight_under_land: Optional[bool] = None,
    clip_to_land: bool = True,
    source: str = "auto",
    palette: str = DEFAULT_PALETTE,
    seed: Optional[int] = None,
    style: Optional[Style] = None,
    use_cache: bool = True,
) -> Thumbnail:
    """Render a greyscale map with one region filled in and a caption banner.

    Give either `place` (free text, e.g. "Mediterranean Sea") or `osm_id`
    (e.g. "R9407") -- the id form when search picks the wrong feature. Several
    places joined with "+" are highlighted as one shape.

    `padding` is how much surrounding context to show, as a fraction of the
    region's own size: lower zooms in, higher pulls back.

    `highlight_under_land` draws the red shape beneath the landmass instead of
    over it, so coastlines and islands stay visible. Left as None it turns
    itself on for seas and oceans, whose polygons are coarse enough to spill
    over the coast.

    `clip_to_land` masks a land highlight to the landmass. On by default
    because an OSM country boundary includes territorial waters: unclipped,
    Iceland renders as a smooth blob out at sea with a disc around Grimsey.

    `source` picks the dataset -- see SOURCES. Use "natural_earth" for deserts,
    mountain ranges and rainforests, which OSM's geocoder gets wrong.

    `palette` picks the colour profile -- see PALETTE_NAMES. An explicit
    `style` overrides it entirely.

    `seed` pins the caption's random tilt and sideways nudge; None varies them
    per render.
    """
    if not place and not osm_id:
        raise GeoLookupError("Provide a place name or an OSM id.")

    style = style or style_for_palette(palette)

    highlight, geo = _resolve_region(place, osm_id, use_cache, source)

    viewport = fit(bounds_of(all_rings(highlight)), width, height, padding=padding)
    view_bounds = viewport.lon_lat_bounds()

    land = basemap.visible_polygons("countries", view_bounds)
    borders = basemap.visible_polygons("subdivisions", view_bounds)

    text = caption or geo["name"]
    if uppercase:
        text = text.upper()

    under_land = geo["marine"] if highlight_under_land is None else highlight_under_land

    result: RenderResult = render_card(
        viewport=viewport,
        land_polygons=land,
        border_polygons=borders,
        highlight_polygons=highlight,
        caption=text,
        width=width,
        height=height,
        highlight_under_land=under_land,
        clip_to_land=clip_to_land,
        style=style,
        seed=seed,
    )
    logger.info(
        "thumbnail rendered: place=%r source=%s palette=%s under_land=%s land=%d borders=%d",
        geo["name"],
        geo["source"],
        palette,
        under_land,
        len(land),
        len(borders),
    )
    return Thumbnail(
        png=result.png,
        width=result.width,
        height=result.height,
        place_name=geo["name"],
        osm_type=geo["osm_type"],
        osm_id=geo["osm_id"],
        caption_lines=result.caption_lines,
        source=geo["source"],
        palette=(palette or DEFAULT_PALETTE).strip().lower(),
    )


def _resolve_region(
    place: Optional[str], osm_id: Optional[str], use_cache: bool, source: str
) -> Tuple[List[Polygon], Dict[str, Any]]:
    """Find the shape(s) to fill red.

    An osm_id resolves to exactly one object. A place resolves each "+"-joined
    part separately and unions the results, so a sea made of named sub-basins
    ("Mediterranean Sea + Adriatic Sea + Aegean Sea") comes out as one red area.
    """
    if source not in SOURCES:
        raise GeoLookupError(f"source must be one of {', '.join(SOURCES)}.")
    if osm_id:
        return _resolve_osm_id(osm_id, use_cache)

    parts = [part.strip() for part in (place or "").split(UNION_SEPARATOR) if part.strip()]
    if not parts:
        raise GeoLookupError("Empty place query.")

    polygons: List[Polygon] = []
    names: List[str] = []
    sources = set()
    marine_flags = []
    first_osm_type = None
    first_osm_id = None

    for part in parts:
        part_polygons, meta = _resolve_one(part, use_cache, source)
        polygons.extend(part_polygons)
        names.append(meta["name"])
        sources.add(meta["source"])
        marine_flags.append(meta["marine"])
        if first_osm_id is None:
            first_osm_type, first_osm_id = meta["osm_type"], meta["osm_id"]

    return polygons, {
        "name": " + ".join(names),
        "osm_type": first_osm_type if len(parts) == 1 else None,
        "osm_id": first_osm_id if len(parts) == 1 else None,
        "source": sources.pop() if len(sources) == 1 else "mixed",
        # Under-land drawing only makes sense if every part is water; one
        # country in the union and the red would vanish under the landmass.
        "marine": all(marine_flags),
    }


def _resolve_osm_id(osm_id: str, use_cache: bool) -> Tuple[List[Polygon], Dict[str, Any]]:
    geo = lookup_osm_id(osm_id, use_cache=use_cache)
    polygons = polygons_from_geometry(geo["geojson"])
    if not polygons:
        raise GeoLookupError(f"OSM object {osm_id} has no fillable area.")
    return polygons, {
        "name": _short_name(geo.get("name", "")),
        "osm_type": geo.get("osm_type"),
        "osm_id": geo.get("osm_id"),
        "source": "osm",
        "marine": _is_water(geo),
    }


def _is_water(geo: Dict[str, Any]) -> bool:
    """Whether an OSM result is a body of water, from its own tagging."""
    return (geo.get("feature_type") or "").lower() in WATER_FEATURE_TYPES


def _resolve_one(place: str, use_cache: bool, source: str) -> Tuple[List[Polygon], Dict[str, Any]]:
    """Resolve one place name against the requested dataset(s)."""
    osm_error = None
    if source in ("auto", "osm"):
        try:
            geo = lookup_place(place, use_cache=use_cache)
            polygons = polygons_from_geometry(geo["geojson"])
            if polygons:
                return polygons, {
                    "name": _short_name(geo.get("name", "")),
                    "osm_type": geo.get("osm_type"),
                    "osm_id": geo.get("osm_id"),
                    "source": "osm",
                    "marine": _is_water(geo),
                }
            osm_error = f"'{place}' has no fillable area in OSM."
        except GeoLookupError as exc:
            osm_error = str(exc)
        if source == "osm":
            raise GeoLookupError(osm_error)

    match = basemap.find_named_feature(place)
    if match:
        return match["polygons"], {
            "name": match["name"],
            "osm_type": None,
            "osm_id": None,
            "source": "natural_earth",
            "marine": match["layer"] == "marine",
        }

    if source == "natural_earth":
        raise GeoLookupError(
            f"No Natural Earth marine or physical region named '{place}'."
        )
    raise GeoLookupError(
        f"{osm_error} No Natural Earth marine or physical region matches it either."
    )


def _short_name(display_name: str) -> str:
    """Nominatim returns a full address chain; the first part is the place."""
    return (display_name or "").split(",")[0].strip()
