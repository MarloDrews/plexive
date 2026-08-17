"""GeoJSON geometry normalization.

Nominatim and Natural Earth both hand back GeoJSON, but in every geometry type
there is. Everything downstream (bounds, drawing) only wants one shape:
a list of polygons, each polygon a list of rings, the first ring the outline
and the rest holes. This module flattens to exactly that.
"""

from typing import Any, Dict, List, Sequence

# polygon = [exterior_ring, hole_ring, ...]; ring = [[lon, lat], ...]
Ring = List[Sequence[float]]
Polygon = List[Ring]


def polygons_from_geometry(geometry: Dict[str, Any]) -> List[Polygon]:
    """Flatten any GeoJSON geometry into polygons.

    Line and point geometries (Nominatim returns those for rivers, borders and
    small places) are not fillable, so they come back empty and the caller
    decides what to do -- rather than silently drawing nothing.
    """
    if not isinstance(geometry, dict):
        return []
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")

    if geometry_type == "Polygon":
        return [_clean_polygon(coordinates)] if _clean_polygon(coordinates) else []
    if geometry_type == "MultiPolygon":
        out = []
        for polygon in coordinates or []:
            cleaned = _clean_polygon(polygon)
            if cleaned:
                out.append(cleaned)
        return out
    if geometry_type == "GeometryCollection":
        out = []
        for part in geometry.get("geometries") or []:
            out.extend(polygons_from_geometry(part))
        return out
    return []


def _clean_polygon(polygon: Any) -> Polygon:
    """Drop rings with too few points to have an area (Pillow needs 3+)."""
    if not isinstance(polygon, (list, tuple)):
        return []
    rings = [list(ring) for ring in polygon if isinstance(ring, (list, tuple)) and len(ring) >= 3]
    return rings


def all_rings(polygons: Sequence[Polygon]) -> List[Ring]:
    return [ring for polygon in polygons for ring in polygon]
