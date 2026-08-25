"""Map projections and viewport fitting.

Two projections, because one cannot cover the whole planet:

  Viewport       Web Mercator. Every ordinary subject -- a country, a sea, a
                 desert -- and the default.
  PolarViewport  Polar stereographic. Mercator stops at 85 degrees and smears
                 everything near it sideways, so a subject wrapping the globe
                 at a pole (Antarctica, the Arctic Ocean) is projected onto a
                 disc centred on that pole instead.

Both expose the same three things the renderer uses -- project_ring(), scaled()
and lon_lat_bounds() -- so render.py never asks which one it was handed.
Choosing between them is fit_subject()'s job.

Kept as plain math instead of pulling in pyproj/shapely: a thumbnail only ever
needs a forward projection and a bounding box, and the backend already has a
long dependency list we do not want to grow for this.
"""

import math
from typing import Iterable, List, Optional, Sequence, Tuple, Union

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
        """Project a whole ring, keeping it in one piece.

        Unwrapping each point on its own (what project() does) tears any ring
        that straddles the meridian half a turn from the viewport centre: the
        points on one side land at the far left of the canvas and the rest at
        the far right, so a country renders as a thin band straight across the
        map. Invisible on a regional card, because the tear line is off-screen
        -- but a viewport wider than 180 degrees brings it into view, and a
        world-scale card came out streaked with grey stripes.

        So the RING is unwrapped as a unit: its first point is placed on the
        same turn as the viewport centre, and every other point follows that
        anchor. A ring genuinely crossing the antimeridian then stays whole,
        which is the same rule bounds_of() already uses.
        """
        if not ring:
            return []
        anchor = float(ring[0][0])
        base = self.center_lon + _wrap_delta(anchor - self.center_lon)
        points = []
        for point in ring:
            lon = base + _wrap_delta(float(point[0]) - anchor)
            x = (lon - self.min_x) * self.scale_x
            y = (self.max_y - _mercator_y(point[1])) * self.scale_y
            points.append((x, y))
        return points

    def scaled(self, factor: int) -> "Viewport":
        """The same view on a canvas `factor` times larger, for supersampling."""
        return Viewport(
            center_lon=self.center_lon,
            min_x=self.min_x,
            max_x=self.max_x,
            min_y=self.min_y,
            max_y=self.max_y,
            width=self.width * factor,
            height=self.height * factor,
        )

    @property
    def visible_span_degrees(self) -> float:
        """How much of the world is across the frame, as an angle.

        The renderer's measure of "how far in are we?", used to thicken the
        coastlines on a close crop.
        """
        return self.max_x - self.min_x

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

    A shape that wraps the whole globe has no such narrow box, and unwrapping it
    against an arbitrary first point returns a full turn parked somewhere odd
    (Antarctica came out as -240..119, centred on the Atlantic). Those are
    reported as the plain -180..180 instead.
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
    if max_lon - min_lon >= FULL_TURN_LONGITUDE:
        return -180.0, min_lat, 180.0, max_lat
    return min_lon, min_lat, max_lon, max_lat


# A shape covering at least this much longitude is treated as going all the way
# round. Not 360: coastline data has gaps, and the union of a few polygons that
# together circle the pole never quite closes.
FULL_TURN_LONGITUDE = 350.0

# Longitude buckets used to decide "does this go round the world?". Counting
# the buckets an outline covers, rather than measuring a span, keeps the answer
# independent of where an unwrapping anchor happened to land.
_LONGITUDE_BUCKETS = 36
_BUCKET_WIDTH = 360.0 / _LONGITUDE_BUCKETS
# Three buckets short of the full turn: coastline data has gaps (the Arctic
# Ocean is cut where it meets land), and a shape can circle a pole without
# quite closing.
_BUCKETS_FOR_FULL_TURN = 33

# How far from a pole a subject has to reach before a polar view is considered.
POLAR_LATITUDE = 60.0


def polar_hemisphere(rings: Iterable[Sequence[Sequence[float]]]) -> Optional[str]:
    """"north", "south" or None -- whether these rings want a polar view.

    True for a subject that both circles the globe in longitude and reaches
    into a polar region: Antarctica, the Arctic Ocean, the Southern Ocean.
    Everything else -- including a tall country like Russia, or Greenland,
    which reach far north but nowhere near all the way round -- keeps Mercator,
    where they look the way readers expect.

    Coverage is taken along the EDGES, not from the vertices alone: the coarse
    outlines are exactly the shapes that need this (the Arctic Ocean circles the
    pole in 764 points but lands in only 22 of the 36 buckets), and their long
    edges would otherwise read as gaps.
    """
    buckets = set()
    min_lat = math.inf
    max_lat = -math.inf
    for ring in rings:
        previous = None
        for point in ring:
            lon, lat = float(point[0]), float(point[1])
            _mark_longitudes(buckets, previous, lon)
            previous = lon
            min_lat = min(min_lat, lat)
            max_lat = max(max_lat, lat)
        # Rings are closed shapes; the edge back to the start counts too.
        if previous is not None and ring:
            _mark_longitudes(buckets, previous, float(ring[0][0]))
    if len(buckets) < _BUCKETS_FOR_FULL_TURN:
        return None
    if min_lat <= -POLAR_LATITUDE:
        return "south"
    if max_lat >= POLAR_LATITUDE:
        return "north"
    return None


def _mark_longitudes(buckets: set, start: Optional[float], end: float) -> None:
    """Mark every longitude bucket the edge start->end passes through."""
    buckets.add(int((end % 360.0) / _BUCKET_WIDTH) % _LONGITUDE_BUCKETS)
    if start is None:
        return
    # The shorter way round, the way the edge is actually drawn.
    delta = _wrap_delta(end - start)
    steps = int(abs(delta) / _BUCKET_WIDTH) + 1
    for step in range(1, steps):
        lon = start + delta * step / steps
        buckets.add(int((lon % 360.0) / _BUCKET_WIDTH) % _LONGITUDE_BUCKETS)


def _stereographic_radius(lat: float, south: bool) -> float:
    """Distance from the pole in the projection plane, 0 at the centred pole.

    Polar stereographic, the projection every atlas uses for a pole: angles are
    preserved (so shapes stay recognisable) and the pole itself is an ordinary
    point rather than the infinitely wide line Mercator turns it into.
    """
    # Only the FAR pole is clamped. Clamping both would push the centred pole
    # a fraction off the origin, which shows up as a subject that is not quite
    # concentric with it.
    if south:
        return math.tan(math.pi / 4 + math.radians(min(lat, _POLAR_MAX_LATITUDE)) / 2)
    return math.tan(math.pi / 4 - math.radians(max(lat, -_POLAR_MAX_LATITUDE)) / 2)


def _inverse_stereographic(radius: float, south: bool) -> float:
    """Inverse of _stereographic_radius: plane distance back to a latitude."""
    lat = math.degrees(2 * math.atan(max(radius, 0.0)))
    return lat - 90.0 if south else 90.0 - lat


# The far pole projects to infinity; stop just short of it so a stray point in
# the other hemisphere is a big number instead of an overflow.
_POLAR_MAX_LATITUDE = 89.9

# Points beyond this multiple of the canvas's corner distance are pulled back
# to it. They are far off-frame either way, and capping the RADIUS (rather than
# x and y separately, as the renderer's own clamp does) keeps each one on its
# true bearing from the pole, so an edge running off the frame still points
# where it should.
_POLAR_RADIUS_CLAMP = 3.0


class PolarViewport:
    """Maps lon/lat to pixels through a polar stereographic projection.

    Interchangeable with Viewport from the renderer's point of view, and built
    the same way: from a box in projected coordinates, here the plane the pole
    is projected onto rather than the Mercator sheet. The pole is the plane's
    origin, `center_lon` points straight up (south) or straight down (north),
    and there is no antimeridian to straddle -- longitude is an angle around the
    pole, so a ring circling it is drawn as one unbroken loop.
    """

    def __init__(
        self,
        hemisphere: str,
        center_lon: float,
        min_x: float,
        max_x: float,
        min_y: float,
        max_y: float,
        width: int,
        height: int,
    ):
        if hemisphere not in ("north", "south"):
            raise ValueError("hemisphere must be 'north' or 'south'")
        self.hemisphere = hemisphere
        self.south = hemisphere == "south"
        self.center_lon = center_lon
        self.min_x = min_x
        self.max_x = max_x
        self.min_y = min_y
        self.max_y = max_y
        self.width = width
        self.height = height
        self.scale = width / (max_x - min_x)
        # Furthest the canvas reaches from the pole, which is one of its corners
        # -- what lon_lat_bounds() and the off-frame clamp are measured against.
        self._corner_radius = max(
            math.hypot(x, y) for x in (min_x, max_x) for y in (min_y, max_y)
        )
        self._radius_limit = _POLAR_RADIUS_CLAMP * self._corner_radius

    def project(self, lon: float, lat: float) -> Tuple[float, float]:
        radius = min(_stereographic_radius(lat, self.south), self._radius_limit)
        angle = math.radians(lon - self.center_lon)
        plane_x = radius * math.sin(angle)
        # The central meridian runs down from the pole on a north map and up
        # from it on a south one, as printed polar maps have it -- that sign is
        # the only difference between the two.
        plane_y = radius * math.cos(angle) * (1 if self.south else -1)
        return (
            (plane_x - self.min_x) * self.scale,
            # Screen y grows downward.
            (self.max_y - plane_y) * self.scale,
        )

    def project_ring(self, ring: Sequence[Sequence[float]]) -> List[Tuple[float, float]]:
        return [self.project(float(point[0]), float(point[1])) for point in ring]

    def scaled(self, factor: int) -> "PolarViewport":
        """The same view on a canvas `factor` times larger, for supersampling."""
        return PolarViewport(
            hemisphere=self.hemisphere,
            center_lon=self.center_lon,
            min_x=self.min_x,
            max_x=self.max_x,
            min_y=self.min_y,
            max_y=self.max_y,
            width=self.width * factor,
            height=self.height * factor,
        )

    @property
    def visible_span_degrees(self) -> float:
        """How much of the world is across the frame, as an angle.

        The plane distance is not an angle, so it is converted back through the
        projection -- the same number the Mercator viewport reports, so the
        renderer can compare the two.
        """
        half = (self.max_x - self.min_x) / 2
        return 2 * math.degrees(2 * math.atan(half))

    def lon_lat_bounds(self) -> Tuple[float, float, float, float]:
        """The visible area in degrees, for culling basemap polygons.

        Every longitude is on screen, so only the latitude the furthest CORNER
        reaches bounds anything -- measuring to the nearest edge instead would
        cull the land that fills the corners.
        """
        edge = _inverse_stereographic(self._corner_radius, self.south)
        if self.south:
            return -180.0, -90.0, 180.0, min(90.0, edge)
        return -180.0, max(-90.0, edge), 180.0, 90.0


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


# Either projection, wherever code just needs "a viewport" -- the renderer only
# ever calls the three methods both of them have.
AnyViewport = Union[Viewport, PolarViewport]

# The band of the card a polar subject is fitted into, as a fraction of the
# height measured from the top. The caption banner is centred at 0.755 of the
# height and about 0.19 tall (see render.Style), so stopping here keeps the
# whole continent above it -- worth doing where a Mercator subject just takes
# the overlap, because a polar subject is a compact blob whose bottom third
# carries as much of its shape as its top.
POLAR_SUBJECT_BAND = 0.78

# Where the central meridian points. Greenwich up on a south map and down on a
# north one is how atlases print a pole, so Antarctica comes out in the
# orientation a reader has seen it in.
POLAR_CENTER_LON = 0.0


def fit_polar(
    rings: Sequence[Sequence[Sequence[float]]],
    hemisphere: str,
    width: int,
    height: int,
    padding: float = 0.35,
) -> PolarViewport:
    """Build a PolarViewport holding `rings` plus `padding` of context.

    Fits the subject's box in the projection plane, exactly as fit() does for
    Mercator, rather than the disc that encloses it -- Antarctica is a good deal
    wider than it is tall once projected, and a disc would leave most of the
    card empty. The box is then placed in the band above the caption.
    """
    south = hemisphere == "south"
    min_x = min_y = math.inf
    max_x = max_y = -math.inf
    for ring in rings:
        for point in ring:
            radius = _stereographic_radius(float(point[1]), south)
            angle = math.radians(float(point[0]) - POLAR_CENTER_LON)
            plane_x = radius * math.sin(angle)
            plane_y = radius * math.cos(angle) * (1 if south else -1)
            min_x, max_x = min(min_x, plane_x), max(max_x, plane_x)
            min_y, max_y = min(min_y, plane_y), max(max_y, plane_y)
    if min_x > max_x:
        raise ValueError("No coordinates to bound.")

    span_x = max(max_x - min_x, 1e-9) * (1 + 2 * padding)
    span_y = max(max_y - min_y, 1e-9) * (1 + 2 * padding)
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2

    # Largest scale at which the padded subject still fits the band, then the
    # canvas box is whatever that scale makes the full frame cover.
    band = height * POLAR_SUBJECT_BAND
    scale = min(width / span_x, band / span_y)
    view_span_x = width / scale
    view_span_y = height / scale

    return PolarViewport(
        hemisphere=hemisphere,
        center_lon=POLAR_CENTER_LON,
        min_x=center_x - view_span_x / 2,
        max_x=center_x + view_span_x / 2,
        # The subject is centred in the band, so the rest of the frame -- the
        # part the caption sits on -- hangs off the bottom.
        max_y=center_y + (band / 2) / scale,
        min_y=center_y + (band / 2) / scale - view_span_y,
        width=width,
        height=height,
    )


def fit_subject(
    rings: Sequence[Sequence[Sequence[float]]],
    width: int,
    height: int,
    padding: float = 0.35,
) -> AnyViewport:
    """Fit a viewport to the subject, in whichever projection suits it.

    Mercator for everything ordinary; a polar view when the subject wraps the
    globe at a pole, where Mercator has nothing useful to show -- it stops at
    85 degrees and stretches what is left into a band across the whole frame.
    """
    hemisphere = polar_hemisphere(rings)
    if hemisphere:
        return fit_polar(rings, hemisphere, width, height, padding=padding)
    return fit(bounds_of(rings), width, height, padding=padding)
