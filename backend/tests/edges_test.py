"""Post-graph edge tests against a throwaway database.

Run from backend/:
    .venv\\Scripts\\python.exe tests\\edges_test.py

Freezes app/graph_edges.py: derivation from connections + person-list fields,
latent edges (person-only now -- only a person edge may be latent; a non-person
connection to a missing target is discarded, never stored latent), activation,
target/source lifecycle, the published<->not-published status gate (both
directions), the read-next projection (cap 3, person latent marked, non-person
missing dropped), and clean skip/coexistence of legacy string refs with the new
structured shape. Same throwaway-DB pattern as identity_test.py.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _throwaway_db  # noqa: F401 -- must run before any app import

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.graph_edges import (  # noqa: E402
    on_post_deleted,
    on_post_written,
    resolved_read_next,
)
from app.graph_identity import post_identity_key  # noqa: E402
from app.models import Post, PostEdge  # noqa: E402

Base.metadata.create_all(bind=engine)

PASS = 0


def check(name: str, condition: bool, detail: str = ""):
    global PASS
    assert condition, f"FAIL: {name} {detail}"
    PASS += 1
    print(f"ok: {name}")


db = SessionLocal()


def add_post(fmt, feed_card, *, status="published", connections=None, sections=None, is_user=False):
    """Create a post in the structured shape and run the edge hook."""
    post = Post(
        format=fmt,
        title=feed_card.get("title") or feed_card.get("name") or feed_card.get("concept_name") or "x",
        identity_key=post_identity_key(fmt, feed_card),
        feed_card=feed_card,
        sections=sections or [],
        connections=connections or [],
        status=status,
        is_user_content=is_user,
    )
    db.add(post)
    # Mirror the app's M149 transaction shape: flush for the id, derive edges,
    # one commit (on_post_written no longer commits).
    db.flush()
    on_post_written(db, post)
    db.commit()
    return post


def edges_from(post):
    return db.query(PostEdge).filter_by(source_post_id=post.id).all()


def conn(fmt, ref, featured=False):
    return {"format": fmt, "ref": ref, "featured": featured}


# --- latent person edge, then activation -----------------------------------

# Only a person edge may be latent now. Source declares a person-list entry for a
# person whose post does not exist yet (the deliberate "reference a person before
# their post exists" case).
PIONEER = {"name": "Ada Lovelace", "birth_year": 1815}
source = add_post(
    "facts",
    {"headline": "Metabolism scales with mass"},
    sections=[
        {"type": "story", "order": 1, "content": {"key_figures": [dict(PIONEER, role="Pioneer")]}}
    ],
)
src_edges = edges_from(source)
check("person-list entry stores exactly one edge", len(src_edges) == 1, str(src_edges))
check("person edge to missing target is latent", src_edges[0].target_post_id is None)
check("the latent edge is a person edge", src_edges[0].target_format == "people")

# Create the person post. Activation must set target_post_id in one statement.
target = add_post("people", PIONEER)
db.refresh(src_edges[0])
check("creating the person activates the latent edge", src_edges[0].target_post_id == target.id)

# --- lifecycle: target deleted -> re-latent --------------------------------

target_id = target.id
on_post_deleted(db, target)
db.commit()
db.refresh(src_edges[0])
check("deleting the person returns the edge to latent", src_edges[0].target_post_id is None)
check("person post row is gone", db.get(Post, target_id) is None)

# --- lifecycle: source deleted -> edges removed ----------------------------

source_id = source.id
on_post_deleted(db, source)
db.commit()
check(
    "deleting the source removes its edges",
    db.query(PostEdge).filter_by(source_post_id=source_id).count() == 0,
)

# --- status gate: pending casts none, publishing casts them ----------------

# The connection target must exist so publishing casts a (resolved) non-person
# edge -- a non-person edge to a missing target would be discarded, not latent.
some_concept = add_post("concepts", {"concept_name": "Some Concept"})
pending = add_post(
    "facts",
    {"headline": "A pending fact"},
    status="pending",
    connections=[conn("concepts", {"title": "Some Concept"})],
)
check("a pending source casts no edges", len(edges_from(pending)) == 0)

pending.status = "published"
on_post_written(db, pending)
db.commit()
pub_edges = edges_from(pending)
check("publishing the source casts its edges", len(pub_edges) == 1)
check("the published non-person edge resolved to its live target",
      pub_edges[0].target_post_id == some_concept.id)

# --- status gate: published -> not-published teardown (both sides) ---------

# T2 has a live outgoing edge (to T3) and a live incoming edge (from A).
t3 = add_post("concepts", {"concept_name": "Downstream Idea"})
t2 = add_post(
    "books",
    {"title": "Bridge", "author": "Mid Author"},
    connections=[conn("concepts", {"title": "Downstream Idea"})],
)
a = add_post(
    "facts",
    {"headline": "Points at the bridge"},
    connections=[conn("books", {"title": "Bridge", "author": "Mid Author"})],
)
check("T2 outgoing edge resolved while live", edges_from(t2)[0].target_post_id == t3.id)
check("A's edge into T2 resolved while live", edges_from(a)[0].target_post_id == t2.id)

t2_id = t2.id
t2.status = "pending"
on_post_written(db, t2)
db.commit()
check("un-published node drops its outgoing edges", len(edges_from(t2)) == 0)
# A's edge into T2 is a NON-PERSON (books) edge. The module invariant allows only
# person edges to be latent, so an incoming non-person edge to an un-published
# node is DELETED, not re-latented (BE-014/M128). Person re-latenting on teardown
# is covered by the person-edge section above.
check("a non-person edge to an un-published node is deleted, not latented",
      len(edges_from(a)) == 0)
check("no edge references the un-published node",
      db.query(PostEdge).filter_by(target_post_id=t2_id).count() == 0)

# --- read-next: cap at 3, person latent marked not dropped -----------------

# Only person edges can be latent now, so the latent "Coming soon" slots come from
# featured person-list entries: one existing person resolves, the rest are missing
# and stay latent. A fifth (unfeatured) entry is ignored. Cap at 3 still holds.
einstein = add_post("people", {"name": "Albert Einstein", "birth_year": 1879})
reader = add_post(
    "facts",
    {"headline": "Reader with many featured links"},
    sections=[
        {
            "type": "story",
            "order": 1,
            "content": {
                "key_figures": [
                    {"name": "Albert Einstein", "birth_year": 1879, "featured": True},  # resolves
                    {"name": "Missing One", "birth_year": 1900, "featured": True},        # latent
                    {"name": "Missing Two", "birth_year": 1901, "featured": True},        # latent
                    {"name": "Missing Three", "birth_year": 1902, "featured": True},      # trimmed by cap
                    {"name": "Not Featured", "birth_year": 1903},                         # ignored
                ]
            },
        }
    ],
)
rn = resolved_read_next(db, reader)
check("read-next trimmed to 3", len(rn) == 3, str(rn))
resolved_items = [i for i in rn if not i["latent"]]
latent_items = [i for i in rn if i["latent"]]
check("read-next resolves the existing person", any(i["target_post_id"] == einstein.id for i in resolved_items))
check("read-next keeps latent featured person edges, marked latent", len(latent_items) >= 1)
check("latent read-next items keep a display title", all(i["title"] for i in latent_items))

# --- read-next: person-list featured in; people-connection ignored ---------

curie = add_post("people", {"name": "Marie Curie", "birth_year": 1867})
person_post = add_post(
    "facts",
    {"headline": "Has a featured person"},
    sections=[
        {
            "type": "story",
            "order": 1,
            "content": {
                "key_figures": [
                    {"name": "Marie Curie", "birth_year": 1867, "role": "Pioneer", "featured": True},
                    {"name": "Unfeatured Person", "birth_year": 1900, "role": "Extra"},
                ]
            },
        }
    ],
    # A connection that points at a person must be ignored (person edges come
    # only from person-list fields).
    connections=[conn("people", {"name": "Marie Curie", "birth_year": 1867}, featured=True)],
)
person_edges = edges_from(person_post)
check(
    "person-list entries cast person edges; people-connection ignored",
    # Both key_figures (featured Curie + unfeatured) cast person edges; the
    # format=='people' connection casts nothing, so the count is 2, not 3.
    len(person_edges) == 2
    and all(e.target_format == "people" for e in person_edges)
    and any(e.target_post_id == curie.id for e in person_edges),
    str([(e.target_format, e.target_post_id) for e in person_edges]),
)
prn = resolved_read_next(db, person_post)
check("featured person appears in read-next", len(prn) == 1 and prn[0]["format"] == "people")
check("read-next person resolved to the people post", prn[0]["target_post_id"] == curie.id)

# --- coexistence / clean skip ----------------------------------------------

# A live concept target so the well-formed non-person connection resolves (a
# well-formed non-person connection to a MISSING target is discarded -- see the
# dedicated cases below). The person without a birth_year still skips; the one
# with a year casts a latent person edge.
valid_concept = add_post("concepts", {"concept_name": "Valid Concept"})
KNOWN_PERSON_KEY = post_identity_key("people", {"name": "Known Person", "birth_year": 1850})
mixed = add_post(
    "facts",
    {"headline": "Mixed old and new shapes"},
    connections=[
        conn("books", "Scale by Geoffrey West", featured=True),   # legacy string ref -> skipped
        conn("books", {"title": "No Author Book"}, featured=True),  # missing author -> skipped
        conn("concepts", {"title": "Valid Concept"}, featured=True),  # valid + target exists -> resolved
    ],
    sections=[
        {
            "type": "cast",
            "order": 1,
            "content": [
                {"name": "No Year Person", "role": "Unknown era"},  # no birth_year -> skipped
                {"name": "Known Person", "birth_year": 1850, "role": "Has a year"},  # valid -> latent
            ],
        }
    ],
)
mixed_edges = edges_from(mixed)
check(
    "only the resolvable entries cast edges (string ref + missing parts skipped)",
    len(mixed_edges) == 2,
    str([(e.target_format, e.target_identity_key) for e in mixed_edges]),
)
mixed_by_key = {(e.target_format, e.target_identity_key): e for e in mixed_edges}
check(
    "the well-formed concept and the year-bearing person both cast edges",
    ("concepts", "valid concept") in mixed_by_key
    and ("people", KNOWN_PERSON_KEY) in mixed_by_key,
    str(set(mixed_by_key)),
)
check(
    "the well-formed concept connection resolved to its live target",
    mixed_by_key[("concepts", "valid concept")].target_post_id == valid_concept.id,
)
check(
    "the year-bearing person edge is latent (no person post yet)",
    mixed_by_key[("people", KNOWN_PERSON_KEY)].target_post_id is None,
)
# read_next over the same mixed post skips cleanly without raising. Only the valid
# featured connection survives, now RESOLVED (the cast persons here are not
# featured; the legacy string ref and the author-less books ref are skipped).
mixed_rn = resolved_read_next(db, mixed)
check(
    "read-next over mixed shapes: the resolved concept only",
    len(mixed_rn) == 1 and mixed_rn[0]["format"] == "concepts" and not mixed_rn[0]["latent"],
    str(mixed_rn),
)

# --- new rule: non-person edges may not be latent --------------------------

# A non-person connection whose target does not exist stores NO edge -- not
# latent, not rejected, simply absent.
no_target = add_post(
    "facts",
    {"headline": "Points at a missing book and concept"},
    connections=[
        conn("books", {"title": "Ghost Book", "author": "Nobody"}),
        conn("concepts", {"title": "Ghost Concept"}),
    ],
)
check(
    "non-person connection to a missing target stores no edge",
    len(edges_from(no_target)) == 0,
    str([(e.target_format, e.target_identity_key) for e in edges_from(no_target)]),
)

# The same kind of connection to an EXISTING live target stores a resolved edge.
live_book = add_post("books", {"title": "Real Book", "author": "Real Author"})
has_target = add_post(
    "facts",
    {"headline": "Points at a real book"},
    connections=[conn("books", {"title": "Real Book", "author": "Real Author"})],
)
ht_edges = edges_from(has_target)
check(
    "non-person connection to a live target stores one resolved edge",
    len(ht_edges) == 1 and ht_edges[0].target_post_id == live_book.id,
    str(ht_edges),
)

# read_next: a featured non-person to a missing target is ABSENT, while a featured
# person to a missing target stays latent ("Coming soon").
rn_mix = add_post(
    "facts",
    {"headline": "Featured missing person and missing concept"},
    connections=[conn("concepts", {"title": "Still Missing Concept"}, featured=True)],
    sections=[
        {"type": "story", "order": 1, "content": {
            "key_figures": [{"name": "Future Person", "birth_year": 1990, "featured": True}]
        }}
    ],
)
rn_items = resolved_read_next(db, rn_mix)
check(
    "featured non-person missing target is absent from read_next",
    all(i["format"] != "concepts" for i in rn_items),
    str(rn_items),
)
person_latent = [i for i in rn_items if i["format"] == "people"]
check(
    "featured person missing target stays latent in read_next",
    len(person_latent) == 1 and person_latent[0]["latent"] and person_latent[0]["title"] == "Future Person",
    str(rn_items),
)

# Teardown semantics (BE-014/M128): deleting a book target deletes the incoming
# NON-person edge outright (the invariant forbids a latent non-person edge), while
# the holder's person latent edge is untouched. A later rebuild re-derives the same
# person latent edge and still casts no book edge (target gone).
ephemeral_book = add_post("books", {"title": "Ephemeral", "author": "Soon Gone"})
holder = add_post(
    "facts",
    {"headline": "Holds a book edge and a person edge"},
    connections=[conn("books", {"title": "Ephemeral", "author": "Soon Gone"})],
    sections=[
        {"type": "story", "order": 1, "content": {
            "key_figures": [{"name": "Latent Person", "birth_year": 1700}]
        }}
    ],
)
held = {e.target_format: e for e in edges_from(holder)}
check(
    "holder has a resolved book edge and a latent person edge",
    len(held) == 2
    and held["books"].target_post_id == ephemeral_book.id
    and held["people"].target_post_id is None,
    str([(e.target_format, e.target_post_id) for e in edges_from(holder)]),
)
# Delete the book target: the incoming non-person edge is DELETED (not latented),
# so no transient non-person latent row is left in the DB (BE-014/M128).
on_post_deleted(db, ephemeral_book)
db.commit()
check(
    "deleting the book target deletes the incoming non-person edge outright",
    db.query(PostEdge).filter_by(source_post_id=holder.id, target_format="books").count() == 0,
)
after = edges_from(holder)
check(
    "the holder keeps only its person latent edge after the book target is deleted",
    len(after) == 1 and after[0].target_format == "people" and after[0].target_post_id is None,
    str([(e.target_format, e.target_post_id) for e in after]),
)
# Rebuild the holder: still just the person latent edge (the book target is gone,
# so its non-person edge is discarded, never stored latent).
on_post_written(db, holder)
db.commit()
after = edges_from(holder)
check(
    "rebuild keeps the person latent edge and casts no book edge",
    len(after) == 1 and after[0].target_format == "people" and after[0].target_post_id is None,
    str([(e.target_format, e.target_post_id) for e in after]),
)

# --- identity-key hijack is blocked for user content (SEC-014/M128) --------
# An official concept owns an identity key; a linker resolves to it. A user post
# crafted with the SAME key must NOT capture that resolved edge.
official = add_post("concepts", {"concept_name": "Shared Key Idea", "title": "Shared Key Idea"})
linker = add_post(
    "facts",
    {"headline": "Points at the shared key"},
    connections=[conn("concepts", {"title": "Shared Key Idea"})],
)
link_edge = edges_from(linker)[0]
check("linker resolves to the official post", link_edge.target_post_id == official.id)

hijacker = add_post(
    "concepts",
    {"concept_name": "Shared Key Idea", "title": "Shared Key Idea"},
    is_user=True,
)
db.refresh(link_edge)
check("a user post cannot hijack an official post's identity-key edge",
      link_edge.target_post_id == official.id)

db.close()

print(f"\nAll {PASS} edge checks passed.")
