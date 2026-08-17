"""Thumbnail spec -> PNG bytes.

A post stores WHAT its thumbnail should show (posts.thumbnail_spec, authored in
the post JSON under "thumbnail"), not the image itself:

    {"generator": "geography", "place": "Mediterranean Sea",
     "caption": "Almost dried up", "palette": "blue"}

This module turns such a spec into bytes. Only "geography" exists today; a
generator for another post format is one function plus one GENERATORS entry --
the seeding, upload and backfill pipeline around it never changes.
"""

from typing import Any, Callable, Dict

from .service import render_geography_thumbnail

# Spec keys the geography generator accepts, mapped straight onto
# render_geography_thumbnail's parameters. Listed explicitly so a typo in a
# post JSON is reported instead of silently ignored.
_GEOGRAPHY_KEYS = frozenset(
    {
        "place",
        "osm_id",
        "caption",
        "palette",
        "source",
        "padding",
        "seed",
        "uppercase",
        "highlight_under_land",
        "clip_to_land",
        "width",
        "height",
    }
)


def _geography(spec: Dict[str, Any]) -> bytes:
    unknown = set(spec) - _GEOGRAPHY_KEYS - {"generator"}
    if unknown:
        raise ValueError(
            f"unknown key(s) for the geography generator: {', '.join(sorted(unknown))}"
        )
    kwargs = {k: v for k, v in spec.items() if k in _GEOGRAPHY_KEYS}
    return render_geography_thumbnail(**kwargs).png


GENERATORS: Dict[str, Callable[[Dict[str, Any]], bytes]] = {
    "geography": _geography,
}


def render_from_spec(spec: Dict[str, Any]) -> bytes:
    """Render the PNG described by `spec`.

    Raises ValueError for a malformed spec (missing/unknown generator, unknown
    key); generator-specific failures (e.g. GeoLookupError for a place name
    that resolves to nothing) propagate as they are, so the caller can tell a
    bad spec apart from a lookup that just did not find the place.
    """
    if not isinstance(spec, dict):
        raise ValueError("thumbnail spec must be an object")
    name = spec.get("generator")
    if not name:
        raise ValueError("thumbnail spec has no 'generator'")
    generator = GENERATORS.get(name)
    if generator is None:
        raise ValueError(
            f"unknown thumbnail generator {name!r} (known: {', '.join(sorted(GENERATORS))})"
        )
    return generator(spec)
