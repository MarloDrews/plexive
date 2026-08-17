"""Thumbnail generation.

Renders 1280x720 title cards. The first (and currently only) style is the
geography card: a greyscale world basemap with one region filled red and a
red caption banner underneath -- see render.py.
"""

from .generators import GENERATORS, render_from_spec
from .service import render_geography_thumbnail

__all__ = ["GENERATORS", "render_from_spec", "render_geography_thumbnail"]
