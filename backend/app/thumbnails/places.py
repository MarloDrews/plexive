"""Composite places: one name that always resolves to the same set of shapes.

Some bodies of water are not one feature in the data. OSM has no fillable
polygon for the Mediterranean at all, and Natural Earth splits it into SIX:
the main basin plus the Balearic, Tyrrhenian, Ionian, Adriatic and Aegean
seas. A bare lookup therefore fills only the middle and leaves the five
sub-basins grey -- the map looks broken, and worse, which shape you get
depends on what the geocoder ranks first that day.

A preset pins the answer: the parts to union AND the dataset to take them
from, so the same name renders the same card every time. This is the place to
add a body of water whose render comes out incomplete, rather than making
every caller remember to write out the "+"-union by hand.

Only genuinely split features belong here. A place that resolves correctly on
its own must NOT get an entry -- the table is a list of known data problems,
not a gazetteer.
"""

from dataclasses import dataclass
from typing import Dict, Optional, Tuple

# Same normalization as the named-feature lookup (case, spacing, hyphens), so a
# preset key and a data-set name can never disagree about what "matches".
from .basemap import _normalize


@dataclass(frozen=True)
class PlacePreset:
    # Reported back and used as the default caption: the whole thing has one
    # name, even though it is rendered from several polygons.
    name: str
    # Feature names to look up and fill as a single shape.
    parts: Tuple[str, ...] = ()
    # Or: a coarse (lon, lat) ring around the whole basin, filled by clipping
    # it to the water inside it. Used where NO data set holds the sea in
    # usable pieces -- see MEDITERRANEAN_OUTLINE. Needs no lookup at all, so a
    # preset with an outline renders offline and byte-identically every time.
    outline: Tuple[Tuple[float, float], ...] = ()
    # Where to take the parts from. Pinning the dataset is half the point of a
    # preset: "auto" would re-ask OSM for every sub-basin on every render and
    # drift with its search ranking. An explicit `source` argument still wins.
    source: str = "natural_earth"


def _preset(name: str, *parts: str, source: str = "natural_earth") -> Tuple[str, PlacePreset]:
    return _normalize(name), PlacePreset(name=name, parts=(name,) + parts, source=source)


def _outlined(name: str, outline: Tuple[Tuple[float, float], ...]) -> Tuple[str, PlacePreset]:
    return _normalize(name), PlacePreset(name=name, outline=outline)


# A coarse ring around the Mediterranean basin, filled by subtracting the
# landmass from it. Every point on land is deliberately well inland -- only the
# coastline decides where the blue stops, so these need to be roughly right,
# not accurate. What DOES matter are the three gates, where the ring cuts
# across water to keep a neighbouring sea out:
#
#   Gibraltar   the two points at 5.60W  -> the Atlantic stays out
#   Bosphorus   41.25N/40.95N at ~29.1E  -> the Black Sea stays out
#                                           (the Sea of Marmara stays in)
#   Suez        the 30.7N/30.6N pair     -> the Red Sea stays out, passing
#                                           north of the Gulf of Suez (29.9N)
#
# Move a gate and a whole neighbouring sea turns blue, so check a render after
# touching one.
MEDITERRANEAN_OUTLINE: Tuple[Tuple[float, float], ...] = (
    # Gibraltar gate, Spanish side, then inland along southern Europe.
    (-5.60, 36.30),
    (-4.50, 37.60),
    (-2.50, 38.60),
    (-1.00, 39.80),
    (0.20, 41.20),
    (1.50, 42.40),
    (3.20, 44.00),
    (5.50, 45.30),
    (7.50, 45.80),
    (9.50, 46.30),
    (12.00, 46.60),
    (14.00, 46.60),
    (16.00, 46.20),
    (18.00, 45.30),
    (19.50, 44.00),
    (21.00, 42.80),
    (22.00, 41.80),
    (24.00, 41.60),
    (26.00, 41.40),
    (27.50, 41.40),
    (28.80, 41.35),
    # Bosphorus gate, crossing to the Asian side at Istanbul.
    (28.95, 41.25),
    (29.20, 40.95),
    # Inland across Anatolia, south of the Sea of Marmara.
    (29.80, 40.10),
    (31.00, 38.60),
    (33.50, 37.30),
    (35.50, 37.10),
    (36.80, 36.40),
    # Down the Levant, threaded between the coast (~34.6E) and the Dead Sea
    # (~35.4E) so no inland water is caught.
    (36.60, 34.80),
    (36.20, 33.40),
    (35.60, 32.40),
    (35.10, 31.40),
    # Suez gate: north of the Gulf of Suez, then west along North Africa.
    (34.20, 31.00),
    (32.80, 30.70),
    (32.00, 30.60),
    (30.00, 30.40),
    (27.00, 30.60),
    (24.00, 30.60),
    (21.00, 30.00),
    (18.00, 29.60),
    (15.00, 29.80),
    (12.00, 30.80),
    (10.00, 32.40),
    (8.00, 33.60),
    (6.00, 34.60),
    (3.00, 35.00),
    (0.00, 34.60),
    (-2.00, 34.60),
    (-4.50, 35.10),
    # Gibraltar gate, Moroccan side; closes back to the first point.
    (-5.60, 35.60),
)


PRESETS: Dict[str, PlacePreset] = dict(
    [
        # Outlined rather than assembled from named basins, because no data set
        # holds the whole sea: OSM has no fillable Mediterranean at all, and
        # Natural Earth splits it into a main polygon plus Balearic, Gulf of
        # Lion, Tyrrhenian, Ionian, Adriatic and Aegean -- and still has nothing
        # for the Ligurian Sea, the Sea of Crete, the Gulf of Sidra or the
        # Alboran Sea, which stayed grey holes in the middle of the blue.
        _outlined("Mediterranean Sea", MEDITERRANEAN_OUTLINE),
        # Same split: the two gulfs are separate features, so a bare Baltic
        # stops at the Swedish/Finnish coast.
        _preset("Baltic Sea", "Gulf of Bothnia", "Gulf of Finland"),
        # The oceans are stored per hemisphere. "Atlantic Ocean" is an alias of
        # the NORTH Atlantic polygon in Natural Earth, so asking for the ocean
        # by name silently gives you half of it. Note that the whole-ocean
        # polygons are coarse (blunt edges, a hole near the Caribbean): the
        # union fixes the missing half, not the shape quality, so an ocean card
        # is worth a look before it ships.
        _preset("Atlantic Ocean", "North Atlantic Ocean", "South Atlantic Ocean"),
        _preset("Pacific Ocean", "North Pacific Ocean", "South Pacific Ocean"),
    ]
)

# Alternate spellings that should land on the same card. Keys are normalized.
ALIASES: Dict[str, str] = {
    "the mediterranean": "mediterranean sea",
    "mediterranean": "mediterranean sea",
    "the atlantic": "atlantic ocean",
    "atlantic": "atlantic ocean",
    "the pacific": "pacific ocean",
    "pacific": "pacific ocean",
    "the baltic": "baltic sea",
    "baltic": "baltic sea",
}


def find_preset(place: str) -> Optional[PlacePreset]:
    """The preset for this name, or None for an ordinary place."""
    key = _normalize(place)
    if not key:
        return None
    return PRESETS.get(ALIASES.get(key, key))
