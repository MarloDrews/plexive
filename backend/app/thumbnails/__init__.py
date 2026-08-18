"""Thumbnail generation.

Renders 1280x720 title cards. The first (and currently only) style is the
geography card: a greyscale world basemap with one region filled red and a
red caption banner underneath -- see render.py.
"""

from .catalog import GeneratorInfo, Param, catalog_json, catalog_markdown, validate_spec
from .generators import GENERATORS, render_from_spec
from .service import render_geography_thumbnail

__all__ = [
    "GENERATORS",
    "GeneratorInfo",
    "Param",
    "catalog_json",
    "catalog_markdown",
    "render_from_spec",
    "render_geography_thumbnail",
    "validate_spec",
]
