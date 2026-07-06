"""Reading time computed from a post's reader-facing text.

Reading time is computed, not authored: an authored estimate drifts from the
content. We walk the post's sections, count every reader-facing word, and
divide by a fixed words-per-minute rate. One rule holds for all formats. The
value is computed on WRITE (posts.py create, seed.py upsert) and stored on
posts.reading_minutes, so list endpoints never re-walk the sections JSON per
request; this module stays the single computation source. The feed card, the
detail header, and the at_a_glance row all read the same stored number.
See docs/content-structure/DEEPSCROLL_CONTENT_STRUCTURE.md.
"""

WORDS_PER_MINUTE = 230

# Keys whose string values are markup, URLs, or credit lines rather than
# reading text. Skipped so an SVG glyph or an image URL never counts as words.
# An image_caption is real reading text, so it is deliberately kept.
_SKIP_KEYS = {"card_visual", "svg", "url", "attribution", "image_attribution", "doi"}


def _is_non_text_key(key: str) -> bool:
    return key in _SKIP_KEYS or key.endswith("_url") or key.endswith("_svg")


def _collect(node, out: list) -> None:
    """Recursively gather reader-facing strings, skipping the non-text keys."""
    if node is None:
        return
    if isinstance(node, str):
        out.append(node)
        return
    if isinstance(node, list):
        for item in node:
            _collect(item, out)
        return
    if isinstance(node, dict):
        for key, value in node.items():
            if not _is_non_text_key(key):
                _collect(value, out)


def compute_reading_minutes(sections) -> int:
    """Minutes of reading derived from a post's raw section text. Floor of 1.

    Counts the full text, including quiz explanations, so the number matches
    what a reader actually reads. Must run on the raw ORM sections, before any
    serialization stripping (quiz answers) or dropping (list endpoints).
    """
    if not isinstance(sections, list):
        return 1
    strings: list = []
    for section in sections:
        if isinstance(section, dict):
            _collect(section.get("content"), strings)
    total = sum(len(s.split()) for s in strings if s.strip())
    return max(1, round(total / WORDS_PER_MINUTE))
