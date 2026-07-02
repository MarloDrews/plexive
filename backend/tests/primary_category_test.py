"""Regression: PostOut.primary_category_name is the display name of tags[0].

Run from backend/:
    .venv\\Scripts\\python.exe tests\\primary_category_test.py

The card eyebrow and the interest chips must label the same slug identically, so
the eyebrow name is delivered as a single derived field on the post payload,
resolved from the post's OWN interests (Interest.name) for tags[0] -- never a
second, independent naming function. This freezes that contract:
  - primary_category_name equals the Interest.name of tags[0] (the primary), not
    tags[1];
  - that name is among the interests list, so eyebrow and chips cannot disagree;
  - a post with empty/unmapped tags gets null (renders no eyebrow; such posts are
    reported, not edited).
Throwaway SQLite DB via _throwaway_db.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _throwaway_db  # noqa: F401 -- must run before any app import

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Interest, Post  # noqa: E402

Base.metadata.create_all(bind=engine)

client = TestClient(app)

db = SessionLocal()

# Interests keyed by slug, names as seed.py's slug_to_name would produce them.
# These names are the single source the eyebrow must agree with.
NAMES = {
    "neuroscience": "Neuroscience",
    "philosophy-of-mind": "Philosophy of Mind",
}
for slug, name in NAMES.items():
    db.add(Interest(name=name, slug=slug))
db.commit()


def make_post(tags):
    interests = [db.query(Interest).filter_by(slug=s).first() for s in tags]
    interests = [i for i in interests if i]
    p = Post(
        format="academy",
        title="A paper",
        feed_card={"title": "A paper"},
        sections=[],
        tags=tags,
        connections=[],
        interests=interests,
        status="published",
        is_user_content=False,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p.id


# Primary category is tags[0] = neuroscience; tags[1] is a different name.
pid = make_post(["neuroscience", "philosophy-of-mind"])
# Empty-tags post: no primary category name.
empty_pid = make_post([])
db.close()

failures = []

body = client.get(f"/api/posts/{pid}").json()
name = body.get("primary_category_name")
if name != "Neuroscience":
    failures.append(f"primary_category_name should be 'Neuroscience' (tags[0]), got {name!r}")
# It must be tags[0]'s name, not tags[1]'s.
if name == "Philosophy of Mind":
    failures.append("primary_category_name resolved to tags[1], not tags[0]")
# Eyebrow/chip agreement: the eyebrow name is one of the interest chips.
if name not in body.get("interests", []):
    failures.append(f"primary_category_name {name!r} not among interests {body.get('interests')!r}")

# Empty tags -> null (renders no eyebrow; such posts are reported, not edited).
ebody = client.get(f"/api/posts/{empty_pid}").json()
if ebody.get("primary_category_name") is not None:
    failures.append(
        f"empty-tags post should have null primary_category_name, got {ebody.get('primary_category_name')!r}"
    )

if failures:
    print("FAIL:")
    for f in failures:
        print("  -", f)
    sys.exit(1)

print("PASS: primary_category_name = tags[0] display name, agrees with the chips; empty tags -> null.")
