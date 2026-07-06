"""Identity keys for the post graph.

Posts are nodes; connections are natural-identity strings one post declares to
others ("Title by Author", "Name (birth_year)", or a bare title -- never a slug
or UUID, see docs/content-structure/BULK_GENERATION_PROMPTS.md). To resolve those
declared links to real posts (Block 2), every post gets a normalized identity_key
computed from its own format-specific parts.

A post's own key and an incoming connection ref's key MUST go through one assembly
path so they can never drift: _key_from_parts() takes structured parts and returns
the canonical key. Block 2 resolves a ref by parsing it into the same structured
parts and calling _key_from_parts() -- it must NOT rebuild a string and normalize
it separately.

Aliases (extension point, not built)
------------------------------------
A post's canonical key stays exactly as _key_from_parts() builds it. To let a post
also answer to alternate identity strings (e.g. Laozi / Lao Tzu) without renaming
it, a post could later declare alias strings in the JSON authoring layer (in
feed_card, or a JSONB column added the same non-breaking way add_graph_columns.py
added tags/connections). At write those aliases normalize through the SAME
_key_from_parts() into alternate keys; activation (graph_edges.activate_edges_for)
would then match latent edges on the canonical key OR any alias key. Edges already
key on (format, identity_key) and post_edges already has a `kind` column, so no
edge-schema change and no migration are needed -- aliases are additive (none today
== today's behavior). The mis-keyed entries surfaced by graph_edges.
unmatched_latent_edges are exactly what an alias would later resolve.

Build this only on the first real cross-spelling collision between two existing
posts -- not preemptively (the fold rule is deliberately not expanded to chase
variants, since no single rule catches all). Until then such edges stay correctly
latent and surface in scripts/report_unmatched_edges.py.
"""

import math
import unicodedata

# Dash variants that should all fold to a plain ASCII hyphen so "en-dash" and
# "hyphen" forms of the same name produce the same key.
_DASHES = "‐‑‒–—―−"
_DASH_TABLE = {ord(ch): "-" for ch in _DASHES}


def normalize_identity(text: str) -> str:
    """The single canonicalization for identity strings.

    Folds diacritics (NFKD + drop combining marks; glyphs without a decomposition,
    e.g. the stroke in Sklodowska or CJK, pass through stably), folds dash variants
    to a plain hyphen, lowercases, collapses internal whitespace, and trims.
    Punctuation such as the parentheses in a people key is kept.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    without_marks = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    folded = without_marks.translate(_DASH_TABLE)
    return " ".join(folded.lower().split())


def _coerce_year(value) -> int | None:
    """Coerce a birth year to an int, or None if it is not coercible.

    Returns None, NEVER raises: a malformed birth_year makes the people post
    unresolvable, not a 500. bool is rejected even though it is an int
    subclass; NaN/infinity floats and junk strings like "--480" (which the old
    lstrip-based digit check let through to a raising int()) yield None.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if math.isfinite(value) else None
    if isinstance(value, str):
        # int() accepts one leading sign and surrounding whitespace; anything
        # else ("--480", "12.5", "abc") is not a year.
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def _key_from_parts(
    post_format: str,
    *,
    title: str | None = None,
    author: str | None = None,
    name: str | None = None,
    birth_year=None,
) -> str | None:
    """Assemble the canonical identity key from structured parts.

    This is the ONE assembly path. Block 2 must call this with a connection ref's
    parsed parts so an incoming ref and the target post's own key are built the
    same way. Returns None when a required part is missing or unusable: such a key
    is incomplete (the target is simply not resolvable yet), never a partial key.

    - people: name + birth_year (coerced to int)
    - books:  title + author
    - else:   title
    """
    if post_format == "people":
        year = _coerce_year(birth_year)
        if not name or year is None:
            return None
        return normalize_identity(f"{name} ({year})")
    if post_format == "books":
        if not title or not author:
            return None
        return normalize_identity(f"{title} by {author}")
    if not title:
        return None
    return normalize_identity(title)


def _identity_title(feed_card: dict) -> str:
    """Display title for the "all others" key, same fallback chain as
    seed._post_title. Kept local so this module imports no DB-touching code."""
    return (
        feed_card.get("title")
        or feed_card.get("concept_name")
        or feed_card.get("the_question")
        or feed_card.get("headline")
        or feed_card.get("name")
        or ""
    )


def post_identity_key(post_format: str, feed_card: dict) -> str | None:
    """A post's own identity_key, derived from its feed_card. None when the parts
    needed for its format are missing (unresolvable)."""
    return _key_from_parts(
        post_format,
        title=feed_card.get("title") or _identity_title(feed_card),
        author=feed_card.get("author"),
        name=feed_card.get("name"),
        birth_year=feed_card.get("birth_year"),
    )


def find_identity_collisions(db):
    """Flag posts that resolve to the same identity_key within one format.

    Returns a list of (format, identity_key, [post_ids]) for every group with more
    than one post. NULL keys are ignored. Flag only -- resolution is a human adding
    a discriminator, never an automatic merge.
    """
    from .models import Post

    rows = (
        db.query(Post.id, Post.format, Post.identity_key)
        .filter(Post.identity_key.isnot(None))
        .all()
    )
    groups: dict[tuple[str, str], list[int]] = {}
    for post_id, post_format, key in rows:
        groups.setdefault((post_format, key), []).append(post_id)
    return [
        (post_format, key, ids)
        for (post_format, key), ids in groups.items()
        if len(ids) > 1
    ]
