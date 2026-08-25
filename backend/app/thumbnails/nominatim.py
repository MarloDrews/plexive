"""OpenStreetMap geometry lookup via Nominatim.

Nominatim is the OSM search API. Asked with `polygon_geojson=1` it returns the
actual boundary relation of a place -- a country, a sea, a state, a mountain
range -- which is exactly the shape we fill red.

Two rules from its usage policy are enforced here, because breaking them gets
an IP blocked:
  1. Every request carries an identifying User-Agent (set THUMBNAIL_USER_AGENT
     to something with a contact address before running this in production).
  2. At most one request per second, process-wide.
Results are cached on disk so re-rendering the same region never re-queries.
"""

import hashlib
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger("app.thumbnails.nominatim")

BASE_URL = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org").rstrip("/")

# Server-side geometry simplification, in degrees. Unset by default: asking
# Nominatim to simplify is the wrong place to do it, because the tolerance is
# absolute while the detail that matters is relative to how big the region is
# on screen. A tolerance coarse enough to keep Russia small (3.9 MB, 168k
# points at full detail) turns Iceland into a blob (804 points -> 158). The
# renderer simplifies in pixel space instead, where sub-pixel detail is
# invisible by definition and the tolerance follows the zoom. Set this only if
# the cached payload size actually matters more than coastline quality.
POLYGON_THRESHOLD = os.getenv("NOMINATIM_POLYGON_THRESHOLD", "").strip()
USER_AGENT = os.getenv(
    "THUMBNAIL_USER_AGENT",
    "Plexive-Thumbnails/1.0 (+https://github.com/silasmk/Plexive)",
)
CACHE_DIR = Path(os.getenv("THUMBNAIL_CACHE_DIR", str(Path(__file__).resolve().parents[2] / "data" / "geocache")))
REQUEST_TIMEOUT = 30

_MIN_INTERVAL_SECONDS = 1.0
_throttle_lock = threading.Lock()
_last_request_at = 0.0


class GeoLookupError(RuntimeError):
    """Nominatim was unreachable, or had nothing usable for the query."""


def _throttle() -> None:
    """Serialize requests one second apart (Nominatim's published limit)."""
    global _last_request_at
    with _throttle_lock:
        wait = _MIN_INTERVAL_SECONDS - (time.monotonic() - _last_request_at)
        if wait > 0:
            time.sleep(wait)
        _last_request_at = time.monotonic()


# Bumped whenever the cached payload changes shape OR detail, so stale entries
# are missed rather than silently used. v3 dropped the server-side
# simplification: without the bump, every region already rendered would keep
# serving its old blobby geometry from disk forever.
_CACHE_VERSION = "v3"


def _cache_path(kind: str, key: str) -> Path:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
    return CACHE_DIR / f"{kind}_{_CACHE_VERSION}_{digest}.json"


def _read_cache(path: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write_cache(path: Path, payload: Dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        # A read-only or full disk must not fail the render; we just re-query
        # next time.
        logger.warning("could not write geocache entry %s", path.name)


def _with_threshold(params: Dict[str, Any]) -> Dict[str, Any]:
    """Add polygon_threshold only if one was configured (see POLYGON_THRESHOLD)."""
    if POLYGON_THRESHOLD:
        params["polygon_threshold"] = POLYGON_THRESHOLD
    return params


def _get(endpoint: str, params: Dict[str, Any]) -> Any:
    _throttle()
    try:
        response = requests.get(
            f"{BASE_URL}/{endpoint}",
            params=params,
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        raise GeoLookupError(f"OSM lookup failed: {exc}") from exc
    except ValueError as exc:
        raise GeoLookupError("OSM returned a non-JSON response.") from exc


def lookup_place(query: str, use_cache: bool = True) -> Dict[str, Any]:
    """Resolve a free-text place name to its OSM boundary.

    Returns {"name", "osm_type", "osm_id", "geojson"}. Raises GeoLookupError if
    nothing matched -- a caller that gets an unfillable result (a river, a
    point) should surface that to the user rather than render an empty map.
    """
    query = (query or "").strip()
    if not query:
        raise GeoLookupError("Empty place query.")

    cache_file = _cache_path("search", query.lower())
    if use_cache:
        cached = _read_cache(cache_file)
        if cached:
            return cached

    results = _get(
        "search",
        _with_threshold({"q": query, "format": "jsonv2", "polygon_geojson": 1, "limit": 5}),
    )
    if not isinstance(results, list) or not results:
        raise GeoLookupError(f"No OSM result for '{query}'.")

    # Prefer the first result that is actually an area. Nominatim ranks by
    # relevance, but the top hit for a sea or a range is sometimes a point.
    chosen = None
    for result in results:
        geometry = result.get("geojson") or {}
        if geometry.get("type") in ("Polygon", "MultiPolygon"):
            chosen = result
            break
    if chosen is None:
        raise GeoLookupError(
            f"OSM has no fillable area for '{query}' (only point or line geometry)."
        )

    payload = {
        "name": chosen.get("display_name") or query,
        "osm_type": chosen.get("osm_type"),
        "osm_id": chosen.get("osm_id"),
        # OSM's own tagging of the feature (e.g. category "place", type "sea").
        # The renderer uses it to decide whether the shape is water.
        "category": chosen.get("category"),
        "feature_type": chosen.get("type"),
        "geojson": chosen["geojson"],
    }
    _write_cache(cache_file, payload)
    return payload


def lookup_osm_id(osm_id: str, use_cache: bool = True) -> Dict[str, Any]:
    """Fetch one specific OSM object, e.g. "R9407" (relation 9407).

    The escape hatch for when free-text search picks the wrong feature: look
    the id up on openstreetmap.org once and pin it.
    """
    osm_id = (osm_id or "").strip().upper()
    if not osm_id or osm_id[0] not in "NWR" or not osm_id[1:].isdigit():
        raise GeoLookupError(
            f"Invalid OSM id '{osm_id}'. Expected a type prefix and number, e.g. R9407."
        )

    cache_file = _cache_path("lookup", osm_id)
    if use_cache:
        cached = _read_cache(cache_file)
        if cached:
            return cached

    results = _get(
        "lookup",
        _with_threshold({"osm_ids": osm_id, "format": "jsonv2", "polygon_geojson": 1}),
    )
    if not isinstance(results, list) or not results:
        raise GeoLookupError(f"No OSM object {osm_id}.")

    result = results[0]
    geometry = result.get("geojson") or {}
    if geometry.get("type") not in ("Polygon", "MultiPolygon"):
        raise GeoLookupError(f"OSM object {osm_id} has no fillable area.")

    payload = {
        "name": result.get("display_name") or osm_id,
        "osm_type": result.get("osm_type"),
        "osm_id": result.get("osm_id"),
        "category": result.get("category"),
        "feature_type": result.get("type"),
        "geojson": geometry,
    }
    _write_cache(cache_file, payload)
    return payload
