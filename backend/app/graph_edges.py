"""Derive and maintain the post-graph edges (post_edges table).

Block 1 gave every post an identity_key and added the post_edges table; this
module makes the edges live. A post's outgoing edges are derived on write from
its connections (links to non-person posts) and its featured person-list entries
(links to people). Edges are gated on status='published': only a live post is a
node and casts live edges.

One assembly path: both a post's own key and an incoming connection ref's key go
through graph_identity._key_from_parts, so they can never drift. A ref or person
entry that does not yield a complete key (a legacy string ref, a structured ref
missing a part, a person without a coercible birth_year) is skipped cleanly --
no edge, no exception, never a partial key. Old (string) and new (structured)
authoring shapes therefore coexist safely while the seed data is migrated later.

read_next (the post-detail "read next" set) is a small read-time projection of
the featured edges, resolved against live posts; see resolved_read_next.
"""

from sqlalchemy import and_, or_

from .graph_identity import _key_from_parts
from .models import Post, PostEdge

# The single definition of "is this a live node / a publishable target". Every
# place that decides whether a post counts as published goes through this, so the
# edge table and the read projection can never disagree.
LIVE_STATUS = "published"

# Person-list fields that carry a person edge. key_figures / key_thinkers are
# nested inside a section's dict content; cast / authors_context are the section
# content list directly (section type == the field name). We scan for all four in
# both shapes so any post resolves regardless of which it uses.
_PERSON_FIELDS = ("key_figures", "key_thinkers", "cast", "authors_context")
_PERSON_LIST_SECTION_TYPES = ("cast", "authors_context")


def is_live_node(post) -> bool:
    """A post is a live graph node only while published."""
    return post.status == LIVE_STATUS


def _latent_allowed(target_format) -> bool:
    """Only person edges may be stored/shown latent (target unresolved).

    Person identity (name + birth_year) is stable enough to reference a person
    before their post exists; non-person targets (titles) are spelling-fragile, so
    an unresolved non-person edge is discarded rather than left latent and noisy.
    The one place this rule lives, consulted by both the write-path derivation
    (rebuild_post_edges) and the read-next projection (resolved_read_next) so it
    can never drift between them. Any non-"people" format -- including a future one
    -- is non-latent by this rule.
    """
    return target_format == "people"


def _iter_person_entries(sections):
    """Yield every person dict from the four person-list fields, in any shape.

    Tolerant of missing/odd content: non-dict sections, scalar content and
    non-dict list items are skipped rather than raising.
    """
    if not isinstance(sections, list):
        return
    for section in sections:
        if not isinstance(section, dict):
            continue
        content = section.get("content")
        if isinstance(content, dict):
            for field in _PERSON_FIELDS:
                entries = content.get(field)
                if isinstance(entries, list):
                    for entry in entries:
                        if isinstance(entry, dict):
                            yield entry
        elif isinstance(content, list) and section.get("type") in _PERSON_LIST_SECTION_TYPES:
            for entry in content:
                if isinstance(entry, dict):
                    yield entry


def _connection_key(fmt, ref):
    """Identity key for a connection ref, or None if it cannot resolve cleanly.

    ref must be the structured (dict) form. A legacy string ref is NOT split --
    it returns None (no edge) so old and new shapes coexist during migration.
    People are never linked via connections (only via person-list fields).
    """
    if not fmt or fmt == "people" or not isinstance(ref, dict):
        return None
    if fmt == "books":
        return _key_from_parts("books", title=ref.get("title"), author=ref.get("author"))
    return _key_from_parts(fmt, title=ref.get("title"))


def _edge_specs(post):
    """Yield (target_format, target_identity_key, featured) for a post's edges.

    Skips anything unresolvable (legacy string ref, missing parts, no birth_year)
    without raising and without ever producing a partial key.
    """
    connections = post.connections if isinstance(post.connections, list) else []
    for conn in connections:
        if not isinstance(conn, dict):
            continue
        fmt = conn.get("format")
        key = _connection_key(fmt, conn.get("ref"))
        if key is None:
            continue
        yield fmt, key, bool(conn.get("featured"))

    for person in _iter_person_entries(post.sections):
        key = _key_from_parts(
            "people", name=person.get("name"), birth_year=person.get("birth_year")
        )
        if key is None:
            continue
        yield "people", key, bool(person.get("featured"))


def _resolve_live_targets(db, pairs):
    """Map (format, identity_key) -> (post_id, title) for LIVE posts matching pairs.

    pairs is an iterable of (format, identity_key). One query, OR of per-pair
    equality clauses (robust on both SQLite and PostgreSQL).
    """
    pairs = [(f, k) for f, k in pairs if k is not None]
    if not pairs:
        return {}
    clause = or_(*[and_(Post.format == f, Post.identity_key == k) for f, k in pairs])
    rows = (
        db.query(Post.id, Post.format, Post.identity_key, Post.title)
        .filter(Post.status == LIVE_STATUS, clause)
        .all()
    )
    return {(fmt, key): (pid, title) for pid, fmt, key, title in rows}


def _relatent_incoming(db, post_id):
    """Set target_post_id NULL on every edge pointing at this post (re-latent).

    Used both when the target is deleted and when it stops being a live node.
    """
    db.query(PostEdge).filter(PostEdge.target_post_id == post_id).update(
        {PostEdge.target_post_id: None}, synchronize_session=False
    )


def rebuild_post_edges(db, post):
    """Rebuild this post's outgoing edge rows from its current authoring data.

    Always clears the post's existing rows first. A non-live post inserts none
    (so going non-live tears its outgoing edges down). A live post inserts one
    row per resolvable connection / person entry, with target_post_id resolved
    against existing live posts. A person edge whose target does not exist yet is
    stored latent (target_post_id NULL); a non-person edge whose target does not
    resolve is discarded silently (_latent_allowed), never stored latent. This
    also purges a pre-existing non-person latent row: it is deleted above and not
    re-created here.
    """
    db.query(PostEdge).filter(PostEdge.source_post_id == post.id).delete(
        synchronize_session=False
    )
    if not is_live_node(post):
        return
    specs = list(_edge_specs(post))
    if not specs:
        return
    resolved = _resolve_live_targets(db, {(fmt, key) for fmt, key, _ in specs})
    for fmt, key, featured in specs:
        target = resolved.get((fmt, key))
        if target is None and not _latent_allowed(fmt):
            continue  # non-person edge with no live target: discard, never latent
        db.add(
            PostEdge(
                source_post_id=post.id,
                target_format=fmt,
                target_identity_key=key,
                target_post_id=target[0] if target else None,
                featured=featured,
            )
        )


def activate_edges_for(db, post):
    """Point every edge whose target identity matches this post at it.

    The single indexed statement that activates latent edges when their target
    is inserted or published -- no re-scan, no backfill job.
    """
    if not is_live_node(post) or post.identity_key is None:
        return
    db.query(PostEdge).filter(
        PostEdge.target_format == post.format,
        PostEdge.target_identity_key == post.identity_key,
    ).update({PostEdge.target_post_id: post.id}, synchronize_session=False)


def on_post_written(db, post):
    """Single entry point after any post insert / update / status transition.

    Handles both directions of the status gate:
    - live: rebuild outgoing edges, then activate incoming latent edges.
    - not live: rebuild clears outgoing edges, then re-latent incoming ones, so
      an un-verified / taken-down / un-published post is no longer a live node on
      either side.
    """
    rebuild_post_edges(db, post)
    if is_live_node(post):
        activate_edges_for(db, post)
    else:
        _relatent_incoming(db, post.id)
    db.commit()


def on_post_deleted(db, post):
    """Remove a post and clean up its edges: drop its outgoing rows, and re-latent
    every edge that pointed at it (never dangling). Then delete the post row."""
    post_id = post.id
    db.query(PostEdge).filter(PostEdge.source_post_id == post_id).delete(
        synchronize_session=False
    )
    _relatent_incoming(db, post_id)
    db.delete(post)
    db.commit()


def resolved_read_next(db, post):
    """The post-detail "read next" set, resolved server-side.

    Built from the authoring layer (featured person-list entries first, then
    featured connections -- mirroring the previous frontend order), capped at 3
    at read time, then resolved against live posts. Resolved entries carry the
    target's id + canonical title. An unmatched PERSON entry is kept and marked
    latent (target_post_id None, a "Coming soon" item); an unmatched non-person
    entry contributes nothing, by the same _latent_allowed rule the edge table
    uses, so the projection can never disagree with it. (Cap precedes resolution,
    so dropping an unmatched non-person can leave fewer than 3 items.)
    """
    candidates = []  # (format, key, fallback_title)
    for person in _iter_person_entries(post.sections):
        if not person.get("featured"):
            continue
        key = _key_from_parts(
            "people", name=person.get("name"), birth_year=person.get("birth_year")
        )
        if key is None:
            continue
        candidates.append(("people", key, person.get("name") or ""))

    connections = post.connections if isinstance(post.connections, list) else []
    for conn in connections:
        if not isinstance(conn, dict) or not conn.get("featured"):
            continue
        fmt = conn.get("format")
        ref = conn.get("ref")
        key = _connection_key(fmt, ref)
        if key is None:
            continue
        candidates.append((fmt, key, (ref.get("title") if isinstance(ref, dict) else "") or ""))

    candidates = candidates[:3]
    if not candidates:
        return []

    resolved = _resolve_live_targets(db, {(f, k) for f, k, _ in candidates})
    items = []
    for fmt, key, fallback in candidates:
        target = resolved.get((fmt, key))
        if target is not None:
            items.append(
                {"target_post_id": target[0], "format": fmt, "title": target[1], "latent": False}
            )
        elif _latent_allowed(fmt):
            items.append(
                {"target_post_id": None, "format": fmt, "title": fallback, "latent": True}
            )
        # else: non-person target missing -> contributes nothing (no latent "Coming
        # soon" entry); same one rule as the edge table, so the two never disagree.
    return items


def _report_refs(post):
    """Yield (target_format, target_identity_key, ref_repr) for a post's authoring
    entries, reusing the edge key assembly so the report's keys never drift from the
    edge table's. ref_repr is the raw authoring fragment that produced the key (a
    connection ref dict, or a person's name + birth_year), so the report can show
    WHAT produced an unmatched key -- a typo is obvious in the raw ref, invisible in
    the derived key. Read-only diagnostic helper; mirrors _edge_specs' walk.
    """
    connections = post.connections if isinstance(post.connections, list) else []
    for conn in connections:
        if not isinstance(conn, dict):
            continue
        fmt = conn.get("format")
        ref = conn.get("ref")
        key = _connection_key(fmt, ref)
        if key is None:
            continue
        yield fmt, key, ref
    for person in _iter_person_entries(post.sections):
        key = _key_from_parts(
            "people", name=person.get("name"), birth_year=person.get("birth_year")
        )
        if key is None:
            continue
        yield "people", key, {"name": person.get("name"), "birth_year": person.get("birth_year")}


def unmatched_latent_edges(db):
    """Read-only report: latent edges whose target identity matches no post.

    A latent edge (target_post_id NULL) is ambiguous: either (a) the target post
    genuinely does not exist yet, or (b) the ref's key drifted (transliteration,
    alternate name, typo) so it no longer matches the post it meant. Both look
    identical in the table and cannot be split mechanically. This surfaces both by
    listing every latent edge whose (target_format, target_identity_key) matches NO
    post at all -- of any status -- and, for each, the source post's title and the
    raw ref string that produced the key, so a human can tell drift (b) from a real
    future post (a) at a glance.

    A latent edge whose pair DOES match an existing post (e.g. a target that exists
    but is still pending, so not a live node) is correctly latent and excluded: the
    target exists, the key is fine. Matching is within a format because the pair
    carries the format (node identity = (format, identity_key)).

    Returns a list of (target_format, target_identity_key, sources), sorted by edge
    count (len of sources) descending, where sources is a list of (source_post_id,
    source_title, ref_repr) -- one entry per latent edge. A human reads it to spot
    keys that should have matched and fix them (or, later, add an alias -- see
    graph_identity.py). Pure read: mutates nothing.
    """
    # EXISTS a post with the same (format, identity_key) as this edge's target.
    # Correlated against the outer PostEdge query, dialect-neutral (no group_concat
    # / array_agg), one round trip; grouping + counting is done in Python below.
    matching_post = (
        db.query(Post)
        .filter(
            Post.format == PostEdge.target_format,
            Post.identity_key == PostEdge.target_identity_key,
        )
        .exists()
    )
    rows = (
        db.query(
            PostEdge.target_format,
            PostEdge.target_identity_key,
            PostEdge.source_post_id,
        )
        .filter(PostEdge.target_post_id.is_(None))
        .filter(~matching_post)
        .order_by(PostEdge.source_post_id, PostEdge.id)
        .all()
    )
    if not rows:
        return []

    # Load each source post once, then map its (format, key) -> queue of raw refs so
    # the diagnostic can show what produced each unmatched edge (all of a post's
    # entries for one pair share that pair's matched/unmatched fate, so the queue
    # has exactly one ref per latent edge of that pair).
    source_ids = {sid for _, _, sid in rows}
    posts = {p.id: p for p in db.query(Post).filter(Post.id.in_(source_ids)).all()}
    refs_by_post: dict[int, dict[tuple[str, str], list]] = {}
    for sid, post in posts.items():
        per_pair: dict[tuple[str, str], list] = {}
        for fmt, key, ref in _report_refs(post):
            per_pair.setdefault((fmt, key), []).append(ref)
        refs_by_post[sid] = per_pair

    groups: dict[tuple[str, str], list] = {}
    for fmt, key, sid in rows:
        post = posts.get(sid)
        title = post.title if post else None
        queue = refs_by_post.get(sid, {}).get((fmt, key))
        ref = queue.pop(0) if queue else None
        groups.setdefault((fmt, key), []).append((sid, title, ref))

    return sorted(
        [(fmt, key, sources) for (fmt, key), sources in groups.items()],
        key=lambda row: len(row[2]),
        reverse=True,
    )
