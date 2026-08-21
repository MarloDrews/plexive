"""Ask a model which thumbnail generator fits a post, and with what parameters.

One post in, a validated thumbnail spec (or nothing) out. Deliberately plain:
no file I/O, no database, no argument parsing. The batch driver
(scripts/suggest_thumbnails.py) is a loop around suggest_thumbnail_spec, and
the post-creation flow will call the same function for one post later.

What the model is shown is generated from the generator descriptors
(catalog.py), and what it returns is validated against those same descriptors,
so a new generator needs no change here.
"""

import json
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional

from .. import kiconnect
from .catalog import catalog_json, validate_spec
from .generators import GENERATORS

# How much of a post the model gets. Small on purpose: the choice is driven by
# what the post is ABOUT, which the headline, the tags and the opening lines
# already settle -- and a post file runs to 18 KB, most of it detail that would
# only bury the signal.
DIGEST_BUDGET = 1200

# Section keys holding markup or links rather than prose. Inlining an SVG would
# blow the budget in one field.
SKIP_KEYS = frozenset({"visual_svg", "image_url", "svg", "url", "sources", "link"})


class SuggestionError(RuntimeError):
    """The model answered, but not with a usable spec."""


@dataclass
class Suggestion:
    """What the model decided for one post."""

    # None means no generator fits -- the expected answer for most posts, not a
    # failure. The post then has no thumbnail and shows the placeholder.
    generator: Optional[str]
    spec: Optional[Dict[str, Any]]
    reason: str

    @property
    def fits(self) -> bool:
        return self.spec is not None


SYSTEM_PROMPT = """\
You choose the thumbnail image for a post on Plexive, a social feed of \
worth-knowing content. You do not draw anything: you pick one of the generators \
below and fill in its parameters, or you decline.

Prefer choosing a generator. A post with no generator falls back to a bare \
placeholder image, so declining costs the reader something real -- decline only \
when the post truly offers a generator nothing to work with.

Judge a post by what it is TRUE OF, not by which subject it belongs to. A post \
about economics, history, medicine or policy whose claim is scoped to one \
country or region is a geography post: the map says where. A post whose claim \
holds inside any human mind -- a bias, an illusion, something about memory, \
attention or the brain -- is a mental post, and it needs no place at all, \
which is exactly why the map cannot take it. A post whose claim IS a share of \
a whole you can name, or a rule short enough to write down, is a concept post: \
the dot grid or the formula is the fact itself. Only when nothing a generator \
can show anchors the post -- it holds everywhere, or nowhere -- do you decline.

The generators available to you:

{catalog}

Answer with a single JSON object and nothing else:

  {{"generator": "<name>", "spec": {{...}}, "reason": "<one short sentence>"}}

or, to decline:

  {{"generator": null, "spec": null, "reason": "<one short sentence>"}}

Rules for the answer:
- "spec" must include "generator" as a key too, with the same value.
- Use only the parameters listed for the generator you chose. An unlisted key is \
an error.
- Leave out any parameter you have no reason to change; the defaults are good.
- Follow every rule listed under the generator you chose. They describe real \
failures, not preferences.
- No prose outside the JSON object.\
"""

RETRY_PROMPT = """\
That spec was rejected:

{errors}

Answer again with the corrected JSON object, in the same shape. If the post \
does not really suit any generator after all, decline instead.\
"""


def digest_post(post: Any, post_format: Optional[str] = None) -> str:
    """A short plain-text summary of a post, for the model to judge.

    Accepts a post JSON dict or a Post row: the fields it reads are named the
    same either way. `post_format` overrides the format, which a post JSON on
    disk does not carry -- it is the directory the file sits in.
    """
    fmt = post_format or _field(post, "format") or "unknown"
    tags = _field(post, "tags") or []
    feed_card = _field(post, "feed_card") or {}
    sections = _field(post, "sections") or []

    lines = [f"format: {fmt}"]
    if tags:
        lines.append("tags: " + ", ".join(str(tag) for tag in tags))

    card = _flatten(feed_card, DIGEST_BUDGET // 3)
    if card:
        lines.append("card: " + card)

    remaining = DIGEST_BUDGET - sum(len(line) for line in lines)
    body = _flatten(sections, max(remaining, 0))
    if body:
        lines.append("post: " + body)

    return "\n".join(lines)


def suggest_thumbnail_spec(
    post: Any,
    post_format: Optional[str] = None,
    model: Optional[str] = None,
    temperature: Optional[float] = 0.0,
) -> Suggestion:
    """Pick a generator and its parameters for one post.

    Returns a Suggestion whose spec is None when no generator fits -- the
    normal outcome for a post that is not about the kind of thing any generator
    can draw.

    Raises SuggestionError when the model answers in the wrong shape or returns
    a spec that is still invalid after one correction round, and KiConnectError
    when the model cannot be reached at all. Both are left for the caller to
    handle: a batch run skips the post, an interactive call may want to say so.
    """
    system = SYSTEM_PROMPT.format(
        catalog=json.dumps(catalog_json(GENERATORS), ensure_ascii=False, indent=2)
    )
    user = digest_post(post, post_format)

    reply = kiconnect.chat_json(system, user, model=model, temperature=temperature)
    suggestion, errors = _read_reply(reply)
    if not errors:
        return suggestion

    # One correction round. The model wrote the spec without seeing the
    # validator, so a wrong palette name or a stray key is worth one more
    # exchange; a second failure means it is not going to get there.
    retry_user = user + "\n\n" + RETRY_PROMPT.format(errors="\n".join(f"- {e}" for e in errors))
    reply = kiconnect.chat_json(system, retry_user, model=model, temperature=temperature)
    suggestion, errors = _read_reply(reply)
    if errors:
        raise SuggestionError("; ".join(errors))
    return suggestion


def _read_reply(reply: Any) -> tuple:
    """Turn a parsed reply into (Suggestion, errors). Errors mean try again."""
    if not isinstance(reply, dict):
        return _declined(""), ["answer was not a JSON object"]

    reason = str(reply.get("reason") or "").strip()
    name = reply.get("generator")

    if name is None:
        return _declined(reason), []

    if not isinstance(name, str) or name not in GENERATORS:
        known = ", ".join(sorted(GENERATORS))
        return _declined(reason), [f"unknown generator {name!r} (known: {known}, or null)"]

    spec = reply.get("spec")
    if not isinstance(spec, dict):
        return _declined(reason), ["'spec' must be an object"]

    # The model is asked to repeat the generator inside the spec; filling it in
    # when it forgot is more useful than bouncing the whole answer for it.
    spec = dict(spec)
    spec.setdefault("generator", name)
    if spec["generator"] != name:
        return _declined(reason), [
            f"'spec.generator' is {spec['generator']!r} but 'generator' is {name!r}"
        ]

    errors = validate_spec(GENERATORS[name], spec)
    if errors:
        return _declined(reason), errors

    return Suggestion(generator=name, spec=spec, reason=reason), []


def _declined(reason: str) -> Suggestion:
    return Suggestion(generator=None, spec=None, reason=reason)


def _field(post: Any, name: str) -> Any:
    """Read a field from a post JSON dict or a Post row alike."""
    if isinstance(post, Mapping):
        return post.get(name)
    return getattr(post, name, None)


def _flatten(value: Any, budget: int) -> str:
    """Collect the readable text out of nested post JSON, up to `budget` chars.

    Sections nest differently per type, so this walks rather than reaching for
    known keys: whatever the shape, the prose ends up in the digest and the
    markup fields do not.
    """
    if budget <= 0:
        return ""
    parts: List[str] = []
    _collect(value, parts, budget)
    text = " ".join(parts)
    return text[:budget].rstrip()


def _collect(value: Any, parts: List[str], budget: int) -> None:
    if sum(len(part) for part in parts) >= budget:
        return
    if isinstance(value, str):
        text = value.strip()
        # Markup and links carry no meaning for this decision and eat the
        # budget fast.
        if text and not text.startswith(("<", "http://", "https://")):
            parts.append(text)
        return
    if isinstance(value, Mapping):
        for key, item in value.items():
            if key in SKIP_KEYS:
                continue
            _collect(item, parts, budget)
        return
    if isinstance(value, (list, tuple)):
        for item in value:
            _collect(item, parts, budget)
