"""Read-only-report test for graph_edges.unmatched_latent_edges.

Run from backend/:
    .venv\\Scripts\\python.exe tests\\report_edges_test.py

Freezes the "should this have matched?" report: latent edges whose
(target_format, target_identity_key) matches no post (any status) are surfaced,
grouped + counted + sorted by count descending, each carrying the source post's
title and the raw ref that produced the key; a latent edge whose target exists
(even pending) is correctly latent and excluded; and the report mutates nothing.
Same throwaway-DB pattern as edges_test.py.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _throwaway_db  # noqa: F401 -- must run before any app import

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.graph_edges import on_post_written, unmatched_latent_edges  # noqa: E402
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


def add_post(fmt, feed_card, *, status="published", connections=None, sections=None):
    """Create a post in the structured shape and run the edge hook."""
    post = Post(
        format=fmt,
        title=feed_card.get("title")
        or feed_card.get("name")
        or feed_card.get("headline")
        or feed_card.get("concept_name")
        or "x",
        identity_key=post_identity_key(fmt, feed_card),
        feed_card=feed_card,
        sections=sections or [],
        connections=connections or [],
        status=status,
        is_user_content=False,
    )
    db.add(post)
    db.commit()
    on_post_written(db, post)
    return post


def person_section(name, birth_year):
    """A person-list section carrying one person entry (the only latent edge kind)."""
    return [{"type": "story", "order": 1, "content": {
        "key_figures": [{"name": name, "birth_year": birth_year}]
    }}]


# --- seed ------------------------------------------------------------------

# Only person edges may be latent now, so the report's substrate is person edges --
# which is also the canonical drift case (a name with alternate spellings).
#
# (b) decay: the person post exists as "Laozi (-604)", but two sources reference the
# same person as "Lao Tzu (-604)". The edge key drifts and matches no post.
add_post("people", {"name": "Laozi", "birth_year": -604})
src1 = add_post(
    "facts",
    {"headline": "The Tao that can be told is not the eternal Tao"},
    sections=person_section("Lao Tzu", -604),
)
src2 = add_post(
    "facts",
    {"headline": "Water is the softest thing yet wears down rock"},
    sections=person_section("Lao Tzu", -604),
)

# (a) correct: the person genuinely does not exist yet (a real future post).
src3 = add_post(
    "concepts",
    {"concept_name": "Wu Wei"},
    sections=person_section("Future Sage", 100),
)

# Excluded: the person target exists but is pending (not a live node), so the edge
# is correctly latent -- the key is fine, the post just is not published.
add_post("people", {"name": "Pending Sage", "birth_year": 1500}, status="pending")
add_post(
    "facts",
    {"headline": "Points at a pending sage"},
    sections=person_section("Pending Sage", 1500),
)

# --- run the report (and prove it writes nothing) --------------------------


def snapshot():
    """Counts + every edge's target_post_id, to prove the report mutates nothing."""
    return (
        db.query(Post).count(),
        db.query(PostEdge).count(),
        {e.id: e.target_post_id for e in db.query(PostEdge).all()},
    )


before = snapshot()
report = unmatched_latent_edges(db)
after = snapshot()

check("report is read-only -- nothing written", before == after, f"{before} != {after}")

# --- shape: grouped, counted, sorted by count descending -------------------

check("exactly the two unmatched pairs are reported", len(report) == 2, str(report))

# Sorted by count desc, so the mis-keyed pair (2 edges) comes before the genuinely
# absent one (1 edge).
top_fmt, top_key, top_sources = report[0]
second_fmt, second_key, second_sources = report[1]
check("sorted by count descending", len(top_sources) >= len(second_sources))

check(
    "mis-keyed pair surfaces with count 2",
    (top_fmt, top_key) == ("people", "lao tzu (-604)") and len(top_sources) == 2,
    str(report[0]),
)
check(
    "genuinely-absent pair surfaces with count 1",
    (second_fmt, second_key) == ("people", "future sage (100)")
    and len(second_sources) == 1,
    str(report[1]),
)

# --- diagnostic payload: source title + raw ref per latent edge ------------

mis_ids = {sid for sid, _, _ in top_sources}
check("mis-keyed sources are the two facts posts", mis_ids == {src1.id, src2.id}, str(mis_ids))
check(
    "each mis-keyed source carries its post title",
    all(title for _, title, _ in top_sources),
    str(top_sources),
)
check(
    "each mis-keyed source carries the raw ref that drifted (name 'Lao Tzu')",
    all(isinstance(ref, dict) and ref.get("name") == "Lao Tzu" for _, _, ref in top_sources),
    str(top_sources),
)
absent_source = second_sources[0]
check("genuinely-absent source is the concepts post", absent_source[0] == src3.id)
check(
    "genuinely-absent source carries its title + ref",
    bool(absent_source[1]) and isinstance(absent_source[2], dict),
    str(absent_source),
)

# --- exclusion: a pending target is correctly latent, not a key problem ----

reported_pairs = {(fmt, key) for fmt, key, _ in report}
check(
    "a latent edge whose target exists (pending) is excluded",
    ("people", "pending sage (1500)") not in reported_pairs,
    str(reported_pairs),
)

db.close()

print(f"\nAll {PASS} report checks passed.")
