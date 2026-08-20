"""Thumbnail spec -> PNG bytes.

A post stores WHAT its thumbnail should show (posts.thumbnail_spec, authored in
the post JSON under "thumbnail"), not the image itself:

    {"generator": "geography", "place": "Mediterranean Sea",
     "caption": "Almost dried up", "palette": "blue"}

This module turns such a spec into bytes. A generator is one function, one
GeneratorInfo and one GENERATORS entry -- the seeding, upload and backfill
pipeline around it never changes, and the descriptor is what teaches the doc,
the validator and the model in suggest.py about it at the same time.

The two so far divide the feed between them: "geography" draws posts whose
claim is true OF A PLACE, "mental" draws posts whose claim is true INSIDE A
MIND. A post that is neither still gets no thumbnail.
"""

from typing import Any, Dict

from . import figures
from .catalog import GeneratorInfo, Param, validate_spec
from .mental import AUTO_ANGLE, render_mental_thumbnail
from .service import (
    FONT_NAMES,
    PALETTE_NAMES,
    SOURCES,
    THEME_NAMES,
    render_geography_thumbnail,
)


def _geography(spec: Dict[str, Any]) -> bytes:
    kwargs = {k: v for k, v in spec.items() if k != "generator"}
    return render_geography_thumbnail(**kwargs).png


def _mental(spec: Dict[str, Any]) -> bytes:
    kwargs = {k: v for k, v in spec.items() if k != "generator"}
    return render_mental_thumbnail(**kwargs).png


def _angle_description() -> str:
    """The `angle` parameter's help text, with the angles the asset directory
    actually holds spelled out.

    Built at import rather than written by hand: dropping a camera angle into
    assets/mental/ has to reach the doc and the model prompt, and a folder name
    on its own ("three-quarter") tells the model nothing about what it sees --
    that comes from assets/mental/angles.json.
    """
    described = figures.angle_descriptions()
    known = [
        f"`{name}` ({described[name]})" if name in described else f"`{name}`"
        for name in figures.angle_names()
    ]
    listing = "; ".join(known) if known else "none installed"
    return (
        "Which camera angle of the figure to use: " + listing + ". Leave it out "
        "unless one angle genuinely suits the post better than another -- `auto` "
        "picks one from the subject, which keeps the feed from showing the same "
        "pose every time."
    )


GEOGRAPHY = GeneratorInfo(
    name="geography",
    summary=(
        "A greyscale world map -- dark or light -- with exactly one region filled "
        "in colour and a short caption in a tilted banner underneath."
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
                "stays grey. Four colours only. Leave it out unless the subject really "
                "has a colour -- see the rules."
            ),
        ),
        Param(
            name="theme",
            type="string",
            default="auto",
            choices=THEME_NAMES,
            description=(
                "Whether the map behind the coloured region is a dark slate "
                "(`dark`) or a pale paper (`light`). Leave it out: `auto` derives it "
                "from the subject, which keeps the feed from being all one or the "
                "other."
            ),
        ),
        Param(
            name="font",
            type="string",
            default="auto",
            choices=FONT_NAMES,
            description=(
                "The caption typeface: `sans` is the plain heavy news banner, "
                "`serif` a lighter, dressier one. Leave it out -- `auto` derives one "
                "from the subject, which is what keeps the feed from being set "
                "entirely in the plain face."
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
        "The card has exactly four colours: red, yellow, green and blue. Set "
        "`palette` ONLY when the subject really is one of them: blue for water, "
        "green for forest and vegetation, yellow for desert and heat. Otherwise "
        "leave it out -- omitting it spreads the cards across all four, while "
        "picking red as a fallback made every second card red. Never set it to "
        "match the mood of the topic; a card is not red because the news is bad.",
        "Leave `theme` out unless the post itself has a light or dark register. "
        "`auto` alternates dark and light across the feed on its own, which is the "
        "variety it exists for; pinning every card to one theme throws that away.",
        "Leave `font` out. It used to be yours to choose, with `serif` for a "
        "subject that had age to it and `sans` for anything current -- and because "
        "almost any post can be argued to be current, the dressier face was picked "
        "once in twenty-two posts and every card in the feed looked the same. "
        "`auto` now derives it, which is the only thing that actually gets both "
        "typefaces used.",
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
        # A subject with age to it, so the dressier typeface and a pinned
        # light map -- the one case for setting either by hand.
        {
            "generator": "geography",
            "place": "Greece",
            "caption": "Democracy started here",
            "font": "serif",
            "theme": "light",
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


MENTAL = GeneratorInfo(
    name="mental",
    summary=(
        "A prepared 3D figure -- a head, a brain, or a brain seen through a "
        "translucent head -- lit on a plain dark or light field, with the same "
        "tilted caption banner underneath as the map card. The head takes the "
        "card's colour; the brain keeps its own pink."
    ),
    when_to_use=(
        "the post is about something happening INSIDE one mind. Ask WHOSE MIND IS "
        "DOING THIS: a cognitive bias, an illusion, an effect of memory or "
        "attention, a habit, motivation, emotion, sleep, learning, how a decision "
        "gets made, mental health, or the brain itself as an organ. This is the "
        "card for the posts a map has to decline -- a bias is true of everyone "
        "everywhere, so a country filled in red would say something false, while a "
        "head claims no location at all."
    ),
    when_not_to_use=(
        "the claim is about the world outside a single mind. A claim scoped to a "
        "place is a geography card. A claim about a group, a market, a society, a "
        "technology, a material or a piece of physics is not about anyone's mind, "
        "and a brain over it would announce 'this is psychology' about a post that "
        "is not. Decline in particular when the mind is merely the AUDIENCE: a fact "
        "is not a mental post because reading it feels surprising."
    ),
    render=_mental,
    params=(
        Param(
            name="motif",
            type="string",
            required=True,
            choices=figures.MOTIF_NAMES,
            description=(
                "Which figure to draw. `head` is the person and the default, "
                "`brain` is the organ, `brain_in_head` is the organ seen through a "
                "translucent skull. This is the one real decision on the card, and "
                "the rules below are not optional reading."
            ),
        ),
        Param(
            name="caption",
            type="string",
            required=True,
            description=(
                "The words in the banner, rendered in capitals. Two to five words "
                "that say what the mind is doing."
            ),
        ),
        Param(
            name="angle",
            type="string",
            default=AUTO_ANGLE,
            choices=(AUTO_ANGLE,) + figures.angle_names(),
            description=_angle_description(),
        ),
        Param(
            name="palette",
            type="string",
            default="auto",
            choices=PALETTE_NAMES,
            description=(
                "Colour of the banner, and of the head on a `head` card. The brain "
                "keeps its rendered pink whatever this says, and the field behind "
                "the figure stays grey either way. Four colours only. Leave it "
                "out -- see the rules."
            ),
        ),
        Param(
            name="theme",
            type="string",
            default="auto",
            choices=THEME_NAMES,
            description=(
                "Whether the field behind the figure is a dark slate (`dark`) or a "
                "pale paper (`light`). Leave it out: `auto` derives it from the "
                "subject, which keeps the feed from being all one or the other."
            ),
        ),
        Param(
            name="uppercase",
            type="boolean",
            default=True,
            description=(
                "Capitalise the caption. Leave on unless the caption is a proper "
                "name in mixed case."
            ),
        ),
        Param(
            name="seed",
            type="integer",
            minimum=0,
            maximum=2**31 - 1,
            description=(
                "Pins the caption's slight random tilt, so the same spec renders "
                "the same card twice. Omit to let each render differ."
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
        "`head` IS THE DEFAULT, and most mental posts should get it. The plain "
        "figure of a person suits anything about what someone does or experiences "
        "-- a bias, a habit, an emotion, an identity, a decision, an expectation, "
        "a way of paying attention. The thing doing all of that is a person, not a "
        "lump of tissue, and putting an organ on it adds a note of neuroscience the "
        "post never claimed.",
        "Reach for a brain motif only when the ORGAN is genuinely the subject -- "
        "when drawing a person instead would lose something. `brain` is for a post "
        "literally about the tissue: neurons, sleep, energy consumption, brain "
        "chemistry, anatomy, what a drug does to it. `brain_in_head` is for a post "
        "that turns on something being HIDDEN inside someone, a mechanism they "
        "cannot watch running in themselves -- an illusion, a blind spot, a memory "
        "rewriting itself unnoticed.",
        "`brain_in_head` is the most striking of the three and therefore the "
        "easiest to over-use. Before choosing it, check that the post really trades "
        "on 'you cannot see this happening in you'. If it does not, use `head`.",
        "Beware one particular bad reason. If your justification for a brain motif "
        "is that the post is about the mind, that justification fits EVERY post "
        "this generator draws -- the mind is the whole generator, so it cannot also "
        "be the reason for the motif. Applied honestly it produced a feed in which "
        "every card was the same picture.",
        "The caption is not the headline. It is the two-to-five words a reader "
        'needs while looking at the figure: "You cannot feel it", "Memory rewrites '
        'itself". Write what the mind is DOING, not what the post concludes.',
        "The brain is always pink, on `brain` and `brain_in_head` alike. That "
        "pink is most of what makes it read as a brain rather than an abstract "
        "shape, so it is not something `palette` can or should change -- on a "
        "brain card the colour you pick shows up in the banner only.",
        "Leave `palette` out. Nothing about a bias or a memory is red, yellow, "
        "green or blue, and picking a colour to match the mood of the topic is what "
        "made every second card red on the map generator. `auto` spreads the cards "
        "across all four on its own.",
        "Leave `theme` out for the same reason: `auto` alternates dark and light "
        "across the feed, and pinning it throws that variety away. Set it only when "
        "the post itself has a register -- a card about sleep or the unconscious "
        "may earn `dark`.",
        "Leave `angle` out unless the post genuinely reads better from one camera. "
        "It is the weakest of the choices here and the easiest to over-think.",
        "There is one figure on the card and no room for a second subject. A post "
        "about two people, a conversation, a crowd or a comparison between minds "
        "has nothing this generator can draw -- decline rather than picking `head` "
        "and hoping.",
    ),
    examples=(
        # The default, and deliberately first and most numerous: these are all
        # posts a careless reading would hand a brain, and none of them needs
        # one. Behaviour, expectation, judgement, feeling -- a person does all
        # of it.
        {
            "generator": "mental",
            "motif": "head",
            "caption": "Habits beat willpower",
        },
        {
            "generator": "mental",
            "motif": "head",
            "caption": "Losing hurts twice as much",
        },
        {
            "generator": "mental",
            "motif": "head",
            "caption": "You only recall the ending",
        },
        {
            "generator": "mental",
            "motif": "head",
            "caption": "Believing it makes it work",
        },
        # The organ as a body part.
        {
            "generator": "mental",
            "motif": "brain",
            "caption": "A fifth of your energy",
        },
        {
            "generator": "mental",
            "motif": "brain",
            "caption": "It cleans itself at night",
        },
        # Hidden inside someone: the post is ABOUT not being able to see it.
        {
            "generator": "mental",
            "motif": "brain_in_head",
            "caption": "You edit it every time",
        },
        # Same case, with the theme pinned by hand -- the one reason to set it.
        {
            "generator": "mental",
            "motif": "brain_in_head",
            "caption": "Your blind spot is real",
            "theme": "dark",
        },
    ),
)


GENERATORS: Dict[str, GeneratorInfo] = {
    GEOGRAPHY.name: GEOGRAPHY,
    MENTAL.name: MENTAL,
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
