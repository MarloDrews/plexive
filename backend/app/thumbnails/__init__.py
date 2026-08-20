"""Thumbnail generation.

Renders 1280x720 title cards. Two styles share the frame, the grey themes, the
four-colour palette and the tilted caption banner (render.py), and differ only
in what fills the card:

    geography  a greyscale world basemap with one region filled in colour
    mental     a head or a brain, composited from prepared 3D renders and
               recoloured into the same palette
"""

from .catalog import GeneratorInfo, Param, catalog_json, catalog_markdown, validate_spec
from .generators import GENERATORS, render_from_spec
from .mental import render_mental_thumbnail
from .service import render_geography_thumbnail

__all__ = [
    "GENERATORS",
    "GeneratorInfo",
    "Param",
    "catalog_json",
    "catalog_markdown",
    "render_from_spec",
    "render_geography_thumbnail",
    "render_mental_thumbnail",
    "validate_spec",
]
