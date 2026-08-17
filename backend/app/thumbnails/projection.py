"""Web Mercator projection and viewport fitting.

Kept as plain math instead of pulling in pyproj/shapely: a thumbnail only ever
needs one forward projection and a bounding box, and the backend already has a
long dependency list we do not want to grow for this.
"""

import math
from typing import Iterable, List, Sequence, Tuple

# Web Mercator is undefined at the poles; every implementation clamps at the
# latitude where the projected square closes (~85.0511 degrees).
MAX_LATITUDE = 85.05112878


def _mercator_y(lat: float) -> float:
    """Projected northing, in the SAME units as longitude (degrees).

    The raw Mercator formula returns radians while longitude stays in degrees;
    mixing the two silently makes every map ~57x too flat. Converting back to
    degrees here keeps x and y comparable, which is what the aspect fitting in
    fit() and the single pixel scale both assume.
    """
    lat = max(-MAX_LATITUDE, min(MAX_LATITUDE, lat))
    rad = math.radians(lat)
    return math.degrees(math.log(math.tan(math.pi / 4 + rad / 2)))


class Viewport:
    """Maps lon/lat to pixel coordinates for a fixed-size canvas.

    Built by `fit()` from the bounding box of whatever should be visible, then
    reused for every ring drawn on that canvas so the basemap and the
    highlighted region land on exactly the same grid.
    """

    def __init__(
        self,
        center_lon: float,
        min_x: float,
        max_x: float,
        min_y: float,
        max_y: float,
        width: int,
        height: int,
    ):
        self.center_lon = center_lon
        self.min_x = min_x
        self.max_x = max_x
        self.min_y = min_y
        self.max_y = max_y
        self.width = width
        self.height = height
        self.scale_x = width / (max_x - min_x)
        # Same scale on both axes (fit() already made the box match the canvas
        # aspect); computed separately only to absorb float rounding.
        self.scale_y = height / (max_y - min_y)

    def project(self, lon: float, lat: float) -> Tuple[float, float]:
        # Unwrap longitudes onto the same 360-degree turn as the viewport
        # centre, so a shape spanning the antimeridian does not smear all the
        # way across the canvas as a horizontal streak.
        lon = self.center_lon + _wrap_delta(lon - self.center_lon)
        x = (lon - self.min_x) * self.scale_x
        # Screen y grows downward, Mercator y grows northward: flip.
        y = (self.max_y - _mercator_y(lat)) * self.scale_y
        return x, y

    def project_ring(self, ring: Sequence[Sequence[float]]) -> List[Tuple[float, float]]:
        return [self.project(point[0], point[1]) for point in ring]

    def lon_lat_bounds(self) -> Tuple[float, float, float, float]:
        """The visible area back in degrees, for culling basemap polygons."""
        return (self.min_x, _inverse_mercator(self.min_y), self.max_x, _inverse_mercator(self.max_y))


def _inverse_mercator(y: float) -> float:
    """Inverse of _mercator_y: degree-unit northing back to latitude."""
    return math.degrees(2 * math.atan(math.exp(math.radians(y))) - math.pi / 2)


def _wrap_delta(delta: float) -> float:
    """Normalize a longitude difference into (-180, 180]."""
    while delta > 180.0:
        delta -= 360.0
    while delta <= -180.0:
        delta += 360.0
    return delta


def bounds_of(rings: Iterable[Sequence[Sequence[float]]]) -> Tuple[float, float, float, float]:
    """(min_lon, min_lat, max_lon, max_lat) over every point in every ring.

    Longitudes are unwrapped against the first point seen, so a shape crossing
    the antimeridian yields a narrow box (e.g. 170..190) instead of the full
    -180..180 one a naive min/max would produce.
    """
    min_lon = min_lat = math.inf
    max_lon = max_lat = -math.inf
    anchor = None
    for ring in rings:
        for point in ring:
            lon, lat = float(point[0]), float(point[1])
            if anchor is None:
                anchor = lon
            lon = anchor + _wrap_delta(lon - anchor)
            min_lon = min(min_lon, lon)
            max_lon = max(max_lon, lon)
            min_lat = min(min_lat, lat)
            max_lat = max(max_lat, lat)
    if anchor is None:
        raise ValueError("No coordinates to bound.")
    return min_lon, min_lat, max_lon, max_lat


def fit(
    lon_lat_bounds: Tuple[float, float, float, float],
    width: int,
    height: int,
    padding: float = 0.35,
) -> Viewport:
    """Build a Viewport showing `lon_lat_bounds` plus `padding` of context.

    padding is a fraction of the subject's own size added on every side, so a
    small country and a whole ocean both end up with proportionally the same
    amount of surrounding land visible.
    """
    min_lon, min_lat, max_lon, max_lat = lon_lat_bounds
    min_x, max_x = min_lon, max_lon
    min_y, max_y = _mercator_y(min_lat), _mercator_y(max_lat)

    # A point feature (a city node) has zero extent; give it a real box first
    # or the scale would divide by zero.
    if max_x - min_x < 1e-9:
        min_x, max_x = min_x - 0.5, max_x + 0.5
    if max_y - min_y < 1e-9:
        min_y, max_y = min_y - 0.5, max_y + 0.5

    span_x = (max_x - min_x) * (1 + 2 * padding)
    span_y = (max_y - min_y) * (1 + 2 * padding)
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2

    # Grow the shorter axis until the box matches the canvas aspect, so the
    # subject is never stretched.
    canvas_aspect = width / height
    if span_x / span_y < canvas_aspect:
        span_x = span_y * canvas_aspect
    else:
        span_y = span_x / canvas_aspect

    return Viewport(
        center_lon=center_x,
        min_x=center_x - span_x / 2,
        max_x=center_x + span_x / 2,
        min_y=center_y - span_y / 2,
        max_y=center_y + span_y / 2,
        width=width,
        height=height,
    )
