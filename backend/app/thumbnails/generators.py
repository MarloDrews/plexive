"""Thumbnail spec -> PNG bytes.

A post stores WHAT its thumbnail should show (posts.thumbnail_spec, authored in
the post JSON under "thumbnail"), not the image itself:

    {"generator": "geography", "place": "Mediterranean Sea",
     "caption": "Almost dried up", "palette": "blue"}

This module turns such a spec into bytes. Only "geography" exists today; a
generator for another post format is one function, one GeneratorInfo and one
GENERATORS entry -- the seeding, upload and backfill pipeline around it never
changes, and the descriptor is what teaches the doc, the validator and the
model in suggest.py about it at the same time.
"""

from typing import Any, Dict

from .catalog import GeneratorInfo, Param, validate_spec
from .service import PALETTE_NAMES, SOURCES, render_geography_thumbnail


def _geography(spec: Dict[str, Any]) -> bytes:
    kwargs = {k: v for k, v in spec.items() if k != "generator"}
    return render_geography_thumbnail(**kwargs).png


GEOGRAPHY = GeneratorInfo(
    name="geography",
    summary=(
        "A greyscale world map with exactly one region filled in colour and a short "
        "caption in a banner underneath."
    ),
    when_to_use=(
        "a specific place on Earth anchors what the post says -- a sea, ocean, country, "
        "region, island, desert, mountain range, rainforest or river basin. Ask WHERE "
        "THE CLAIM IS TRUE, not what subject the post belongs to. A post whose topic is "
        "economics, history, biology or policy is still a geography card when its claim "
        "is scoped to one place: banks creating 97% of the money supply is a fact about "
        "the United Kingdom, and the map answers 'where?'. This is the common case -- "
        "reach for it whenever the post names a place it is really talking about."
    ),
    when_not_to_use=(
        "no place anchors the claim, because it holds everywhere or nowhere. A law of "
        "mathematics, a property of a material, a cognitive bias, a fact about the human "
        "body or a piece of physics has no location, and a map of where it happened to "
        "be discovered would mislead. Also decline when a place is named only in "
        "passing, as an example among others, or as the address of a laboratory."
    ),
    render=_geography,
    one_of=(("place", "osm_id"),),
    params=(
        Param(
            name="place",
            type="string",
            description=(
                "The region to fill, as a plain name a map would use: "
                '"Iceland", "Black Sea", "Sahara". Join several with " + " to fill '
                "them as one shape."
            ),
        ),
        Param(
            name="osm_id",
            type="string",
            description=(
                'An OpenStreetMap object id such as "R9407", used instead of `place` '
                "when a name resolves to the wrong feature."
            ),
        ),
        Param(
            name="caption",
            type="string",
            default="",
            description=(
                "The words under the map, rendered in capitals. Two to five words that "
                "say what happened there. Defaults to the place name when empty."
            ),
        ),
        Param(
            name="palette",
            type="string",
            default="auto",
            choices=PALETTE_NAMES,
            description=(
                "Colour of the filled region and its banner; everything else on the card "
                "stays grey. Leave it out unless the subject really has a colour -- see "
                "the rules."
            ),
        ),
        Param(
            name="source",
            type="string",
            default="auto",
            choices=SOURCES,
            description=(
                "Which map data set the filled shape comes from. `auto` tries "
                "OpenStreetMap and falls back to Natural Earth; `natural_earth` is "
                "mandatory for physical regions -- see the rules."
            ),
        ),
        Param(
            name="padding",
            type="number",
            default=0.35,
            minimum=0.0,
            maximum=10.0,
            description=(
                "How much surrounding context to show, as a fraction of the region's own "
                "size. 0.1 is a tight crop, 0.35 the normal card, 2.0 pulls back to the "
                "whole continent."
            ),
        ),
        Param(
            name="uppercase",
            type="boolean",
            default=True,
            description="Capitalise the caption. Leave on unless the caption is a proper name in mixed case.",
        ),
        Param(
            name="highlight_under_land",
            type="boolean",
            description=(
                "Draw the coloured shape beneath the landmass so coastlines stay visible. "
                "Omit it: seas and oceans switch it on by themselves."
            ),
        ),
        Param(
            name="clip_to_land",
            type="boolean",
            default=True,
            description=(
                "Mask a land region to the coastline, so a country's territorial waters "
                "are not filled too. Leave on."
            ),
        ),
        Param(
            name="seed",
            type="integer",
            minimum=0,
            maximum=2**31 - 1,
            description=(
                "Pins the caption's slight random tilt, so the same spec renders the same "
                "card twice. Omit to let each render differ."
            ),
        ),
        Param(
            name="width",
            type="integer",
            default=1280,
            minimum=320,
            maximum=3840,
            description="Image width in pixels. Leave at the default.",
        ),
        Param(
            name="height",
            type="integer",
            default=720,
            minimum=180,
            maximum=2160,
            description="Image height in pixels. Leave at the default; cards are 16:9.",
        ),
    ),
    rules=(
        'EVERY physical region MUST set `source: "natural_earth"` -- deserts, mountain '
        "ranges, rainforests, tundra, steppes, plains, plateaus and polar regions alike. "
        "OpenStreetMap's geocoder is built for addresses and resolves a bare physical "
        'name to whatever business or building carries it: "Sahara" returns a village in '
        'India, "Andes" a town in New York, "Arctic" an appliance shop in Romania. Each '
        "is a real fillable area, so nothing downstream can tell the card is wrong -- it "
        "just renders a red rectangle over a blank grey map.",
        'A polar subject is fine: "Antarctica", "Arctic Ocean" and "Southern Ocean" '
        "are drawn on a map centred on the pole, so they come out the shape an atlas "
        "shows. Still name the LAND when the claim is about land -- Arctic permafrost "
        'is in "Siberia", "Alaska" and "Greenland", not in the Arctic Ocean.',
        'Write "Mediterranean Sea", "Baltic Sea", "Atlantic Ocean" and "Pacific Ocean" '
        "as those plain names. Each is stored split across several polygons and is "
        "already reassembled into the complete sea; naming a sub-basin gives a partial "
        "one.",
        'Two places that belong together are joined with " + ", e.g. '
        '"Black Sea + Sea of Azov". They are filled as a single shape, so only combine '
        "places the post treats as one thing.",
        "Never invent an `osm_id`. Use `place` unless you know the exact id of the "
        "object you mean.",
        "An abstract topic is not a reason to decline. Ask where the claim holds, not "
        'what field it belongs to: "In the UK, banks create 97% of all money" is a post '
        "about money, but it is true OF THE UNITED KINGDOM, so it gets a UK card. A "
        "statistic about one country, a practice in one region, a law in one state -- "
        "all of these are geography cards.",
        "When a post spans two places, pick the one it is ABOUT, or join them with "
        '" + " when it is genuinely about both. Saharan dust fertilising the Amazon is '
        'an "Amazon" card (the place being changed), or "Sahara + Amazon" to show the '
        "route -- not a decline.",
        "The caption is not the headline. It is the two-to-five words a reader needs "
        'while looking at the map: "Almost dried up", "Growing every year".',
        "Set `palette` ONLY when the subject really has a colour: blue for water, "
        "green for forest and vegetation, yellow or orange for desert and heat. "
        "Otherwise leave it out -- omitting it spreads the cards across the whole "
        "palette (red, blue, green, orange, purple, teal, magenta), while picking "
        "red as a fallback made every second card red. Never set it to match the "
        "mood of the topic; a card is not red because the news is bad.",
        "Cities, buildings and single addresses make poor cards -- the map is a world "
        "map, and a point that small renders as a dot. Use a region or nothing.",
    ),
    examples=(
        {
            "generator": "geography",
            "place": "Mediterranean Sea",
            "caption": "Almost dried up",
            "palette": "blue",
            "padding": 0.2,
        },
        {
            "generator": "geography",
            "place": "Sahara",
            "caption": "Growing every year",
            "palette": "yellow",
            "source": "natural_earth",
        },
        {
            "generator": "geography",
            "place": "Antarctica",
            "caption": "Once a rainforest",
            "palette": "green",
            "source": "natural_earth",
            "padding": 0.3,
        },
        # An abstract topic scoped to one country. Here to break the reflex that
        # a post about money cannot be a map -- and with no palette, because
        # money is not a colour.
        {
            "generator": "geography",
            "place": "United Kingdom",
            "caption": "Banks make the money",
        },
        # Two places in one post: the card shows the one being changed.
        {
            "generator": "geography",
            "place": "Amazon",
            "caption": "Fed by Saharan dust",
            "palette": "green",
            "source": "natural_earth",
        },
    ),
)


GENERATORS: Dict[str, GeneratorInfo] = {
    GEOGRAPHY.name: GEOGRAPHY,
}


def render_from_spec(spec: Dict[str, Any]) -> bytes:
    """Render the PNG described by `spec`.

    Raises ValueError for a malformed spec (missing/unknown generator, unknown
    key, out-of-range or wrong-typed value); generator-specific failures (e.g.
    GeoLookupError for a place name that resolves to nothing) propagate as they
    are, so the caller can tell a bad spec apart from a lookup that just did
    not find the place.
    """
    if not isinstance(spec, dict):
        raise ValueError("thumbnail spec must be an object")
    name = spec.get("generator")
    if not name:
        raise ValueError("thumbnail spec has no 'generator'")
    info = GENERATORS.get(name)
    if info is None:
        raise ValueError(
            f"unknown thumbnail generator {name!r} (known: {', '.join(sorted(GENERATORS))})"
        )
    # Validated against the descriptor rather than waved through, so a typo or a
    # palette that does not exist is reported here instead of rendering the
    # wrong card or raising something obscure from deep inside the renderer.
    errors = validate_spec(info, spec)
    if errors:
        raise ValueError(f"invalid {name} spec: " + "; ".join(errors))
    return info.render(spec)
