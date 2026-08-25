"""The grey world map the highlight sits on.

OSM/Nominatim gives us one region at a time; it cannot hand over "every
coastline and border on Earth". So the basemap comes from Natural Earth, the
public-domain dataset every atlas-style map uses, pinned to a release tag and
cached on disk after the first download.

Two layers, matching the reference style:
  admin_0  country polygons  -> the light-grey landmass and its coastline
  admin_1  state/province    -> the faint internal border lines
"""

import json
import logging
import os
import threading
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests

from .geometry import Polygon, polygons_from_geometry
from .projection import bounds_of

logger = logging.getLogger("app.thumbnails.basemap")

DATA_DIR = Path(
    os.getenv("THUMBNAIL_BASEMAP_DIR", str(Path(__file__).resolve().parents[2] / "data" / "basemap"))
)

# Pinned to a release tag, not master: a silent upstream reshuffle would
# otherwise change every thumbnail we generate.
_NE_TAG = os.getenv("NATURAL_EARTH_TAG", "v5.1.2")
_NE_BASE = f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{_NE_TAG}/geojson"

# 50m ("1:50 million") is the middle resolution: detailed enough for a country
# or sea filling a 1280x720 frame, small enough to parse in well under a second.
LAYERS: Dict[str, str] = {
    "countries": "ne_50m_admin_0_countries.geojson",
    "subdivisions": "ne_50m_admin_1_states_provinces.geojson",
    # Highlight fallbacks, not part of the grey basemap. OSM maps seas and
    # physical regions as a single point (place=sea), not an area -- ask
    # Nominatim for "Mediterranean Sea" and you get a node. These two layers
    # are where those shapes actually exist.
    "marine": "ne_50m_geography_marine_polys.geojson",
    "regions": "ne_50m_geography_regions_polys.geojson",
}

# Searched in this order when OSM has no area for a name.
NAMED_FALLBACK_LAYERS = ("marine", "regions")

DOWNLOAD_TIMEOUT = 120

# name -> list of (polygon, lon_lat_bounds). Bounds are precomputed once so the
# renderer can reject off-screen polygons with four float compares instead of
# walking every vertex on every render.
_cache: Dict[str, List[Tuple[Polygon, Tuple[float, float, float, float]]]] = {}
_cache_lock = threading.Lock()


class BasemapError(RuntimeError):
    """The basemap layer is missing and could not be fetched."""


def layer_path(layer: str) -> Path:
    if layer not in LAYERS:
        raise BasemapError(f"Unknown basemap layer '{layer}'.")
    return DATA_DIR / LAYERS[layer]


def ensure_layer(layer: str, force: bool = False) -> Path:
    """Return the local file for a layer, downloading it once if absent."""
    path = layer_path(layer)
    if path.exists() and path.stat().st_size > 0 and not force:
        return path

    url = f"{_NE_BASE}/{LAYERS[layer]}"
    logger.info("downloading basemap layer %s from %s", layer, url)
    try:
        response = requests.get(url, timeout=DOWNLOAD_TIMEOUT, stream=True)
        response.raise_for_status()
        path.parent.mkdir(parents=True, exist_ok=True)
        # Write to a temp file and rename, so an interrupted download can never
        # leave a truncated file that later loads as corrupt JSON.
        temp = path.with_suffix(path.suffix + ".part")
        with temp.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1 << 16):
                handle.write(chunk)
        temp.replace(path)
    except requests.RequestException as exc:
        raise BasemapError(
            f"Could not download basemap layer '{layer}' from {url}: {exc}"
        ) from exc
    except OSError as exc:
        raise BasemapError(f"Could not write basemap layer '{layer}' to {path}: {exc}") from exc
    return path


def load_layer(layer: str) -> List[Tuple[Polygon, Tuple[float, float, float, float]]]:
    """Parsed polygons for a layer, held in memory after the first call.

    Safe as a process-global under the single-worker deployment invariant
    (see main.py); the data is read-only and identical for every request.
    """
    with _cache_lock:
        if layer in _cache:
            return _cache[layer]

    path = ensure_layer(layer)
    try:
        with path.open("r", encoding="utf-8") as handle:
            collection = json.load(handle)
    except (OSError, ValueError) as exc:
        raise BasemapError(f"Basemap layer '{layer}' is unreadable: {exc}") from exc

    entries: List[Tuple[Polygon, Tuple[float, float, float, float]]] = []
    for feature in collection.get("features") or []:
        for polygon in polygons_from_geometry(feature.get("geometry") or {}):
            try:
                entries.append((polygon, bounds_of(polygon)))
            except ValueError:
                continue

    with _cache_lock:
        _cache[layer] = entries
    logger.info("basemap layer %s loaded: %d polygons", layer, len(entries))
    return entries


def visible_polygons(
    layer: str, view_bounds: Tuple[float, float, float, float], margin: float = 5.0
) -> List[Polygon]:
    """Polygons whose bounding box overlaps the viewport (plus a margin).

    A regional thumbnail draws a few hundred polygons instead of ~4000, which
    is most of the render time saved.
    """
    min_lon, min_lat, max_lon, max_lat = view_bounds
    min_lon -= margin
    max_lon += margin
    min_lat -= margin
    max_lat += margin
    out = []
    for polygon, (p_min_lon, p_min_lat, p_max_lon, p_max_lat) in load_layer(layer):
        if p_max_lon < min_lon or p_min_lon > max_lon:
            # Retry against the same box shifted a full turn, so a viewport
            # near the antimeridian still matches polygons stored on the other
            # side of the -180/180 seam.
            if p_max_lon + 360 < min_lon or p_min_lon + 360 > max_lon:
                if p_max_lon - 360 < min_lon or p_min_lon - 360 > max_lon:
                    continue
        if p_max_lat < min_lat or p_min_lat > max_lat:
            continue
        out.append(polygon)
    return out


def find_named_feature(name: str) -> Optional[Dict[str, object]]:
    """Look a sea, ocean, desert or mountain range up by name.

    Returns {"name", "polygons", "layer"} or None. Matching is exact-then-
    substring on a normalized name, because Natural Earth is inconsistent about
    case ("Mediterranean Sea" vs "SAHARA") and sometimes carries a qualifier
    ("Gulf of Mexico" vs "Mexico, Gulf of").
    """
    wanted = _normalize(name)
    if not wanted:
        return None

    exact = None
    partial = None
    for layer in NAMED_FALLBACK_LAYERS:
        for feature_name, polygons in _load_named(layer):
            normalized = _normalize(feature_name)
            if normalized == wanted:
                exact = {"name": feature_name, "polygons": polygons, "layer": layer}
                break
            if partial is None and (wanted in normalized or normalized in wanted):
                partial = {"name": feature_name, "polygons": polygons, "layer": layer}
        if exact:
            break
    return exact or partial


def _normalize(value: str) -> str:
    return " ".join((value or "").lower().replace("-", " ").split())


# layer -> [(name, polygons)]. Same process-global reasoning as _cache.
_named_cache: Dict[str, List[Tuple[str, List[Polygon]]]] = {}


def _load_named(layer: str) -> List[Tuple[str, List[Polygon]]]:
    with _cache_lock:
        if layer in _named_cache:
            return _named_cache[layer]

    path = ensure_layer(layer)
    try:
        with path.open("r", encoding="utf-8") as handle:
            collection = json.load(handle)
    except (OSError, ValueError) as exc:
        raise BasemapError(f"Basemap layer '{layer}' is unreadable: {exc}") from exc

    entries: List[Tuple[str, List[Polygon]]] = []
    for feature in collection.get("features") or []:
        # Natural Earth is not consistent about property case between layers:
        # the marine file uses "name", the regions file "NAME". Lowercase the
        # keys so one lookup covers both.
        properties = {
            str(key).lower(): value for key, value in (feature.get("properties") or {}).items()
        }
        # name_en is the English form; name is the local one; "namealt" carries
        # the alternates Natural Earth records for the same feature.
        for key in ("name_en", "name", "namealt"):
            label = properties.get(key)
            if not isinstance(label, str) or not label.strip():
                continue
            polygons = polygons_from_geometry(feature.get("geometry") or {})
            if polygons:
                entries.append((label.strip(), polygons))

    with _cache_lock:
        _named_cache[layer] = entries
    return entries


def cached_layers() -> Dict[str, Optional[int]]:
    """Layer -> size on disk in bytes, or None if not downloaded yet."""
    status: Dict[str, Optional[int]] = {}
    for layer in LAYERS:
        path = layer_path(layer)
        status[layer] = path.stat().st_size if path.exists() else None
    return status
