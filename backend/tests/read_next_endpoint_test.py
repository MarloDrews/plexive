"""Repro/regression: GET /api/posts/{id} must carry read_next for a post with featured edges.

Run from backend/:
    .venv\\Scripts\\python.exe tests\\read_next_endpoint_test.py

Block 2 added PostOut.read_next (schemas.py) and attached it in routers/posts.py::get_post
via `post.read_next = resolved_read_next(db, post)` (same attach-as-attribute pattern as
attach_counts_one for like_count). This check inserts a PUBLISHED post with two featured
connections + one featured person (mirroring the live post 4: "Allometric scaling",
"Naked mole rats and aging", Geoffrey West). The two connection targets are inserted live
so they RESOLVE; the featured person has no post, so it stays latent (only person edges may
be latent now). The endpoint is hit in-process against the COMMITTED code, and read_next is
asserted present carrying three entries: one latent person + two resolved connections.

This is the control: it PASSES on committed code, proving the code path is correct and the
"key absent" symptom cannot originate from the source. Throwaway SQLite DB via _throwaway_db.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _throwaway_db  # noqa: F401 -- must run before any app import

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.graph_identity import post_identity_key  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Post  # noqa: E402

Base.metadata.create_all(bind=engine)

client = TestClient(app)

FEED_CARD = {"field": "Biology", "headline": "Why elephants outlive mice"}
SECTIONS = [
    {"type": "headline", "order": 1, "content": "Why elephants outlive mice"},
    {
        "type": "story",
        "order": 2,
        "content": {
            "body": "Body text.",
            "key_figures": [
                {"name": "Geoffrey West", "birth_year": 1940, "role": "physicist", "featured": True},
            ],
        },
    },
]
CONNECTIONS = [
    {"format": "concepts", "ref": {"title": "Allometric scaling"}, "featured": True},
    {"format": "facts", "ref": {"title": "Naked mole rats and aging"}, "featured": True},
]

db = SessionLocal()
# Live targets so the two featured connections resolve; Geoffrey West has no post,
# so that featured person edge stays latent. read_next therefore carries one latent
# person entry + two resolved connection entries.
for tfmt, tcard in (
    ("concepts", {"concept_name": "Allometric scaling"}),
    ("facts", {"headline": "Naked mole rats and aging"}),
):
    db.add(
        Post(
            format=tfmt,
            title=tcard.get("concept_name") or tcard.get("headline"),
            identity_key=post_identity_key(tfmt, tcard),
            feed_card=tcard,
            sections=[],
            tags=[],
            connections=[],
            status="published",
            is_user_content=False,
        )
    )
db.commit()

post = Post(
    format="facts",
    title="Why elephants outlive mice",
    identity_key=post_identity_key("facts", FEED_CARD),
    feed_card=FEED_CARD,
    sections=SECTIONS,
    tags=[],
    connections=CONNECTIONS,
    status="published",
    is_user_content=False,
)
db.add(post)
db.commit()
db.refresh(post)
post_id = post.id
db.close()

resp = client.get(f"/api/posts/{post_id}")
assert resp.status_code == 200, f"expected 200, got {resp.status_code}: {resp.text[:300]}"
body = resp.json()

failures = []

if "read_next" not in body:
    failures.append("read_next key ABSENT from the response (the reported bug)")
else:
    rn = body["read_next"]
    if not isinstance(rn, list) or len(rn) != 3:
        failures.append(f"read_next should have 3 entries, got {rn!r}")
    else:
        latent = [i for i in rn if i.get("latent") is True]
        resolved = [i for i in rn if i.get("latent") is False]
        if not (len(latent) == 1 and latent[0].get("format") == "people"
                and latent[0].get("target_post_id") is None):
            failures.append(f"expected exactly one latent person entry, got {rn!r}")
        if not (len(resolved) == 2 and all(i.get("target_post_id") for i in resolved)):
            failures.append(f"expected two resolved connection entries, got {rn!r}")

# These fields must remain present. (connections was dropped from PostOut in
# Batch 3 / M033 -- read_next is the only cross-post field the client reads now.)
for key in ("feed_card", "sections", "tags", "like_count", "interests"):
    if key not in body:
        failures.append(f"expected field {key!r} present, but it is missing")

if failures:
    print("FAIL:")
    for f in failures:
        print("  -", f)
    print("keys present:", sorted(body.keys()))
    sys.exit(1)

print("PASS: read_next present with 3 entries (1 latent person + 2 resolved); other fields present too.")
print("read_next:", body["read_next"])
