"""Identity-key tests against a throwaway database.

Run from backend/:
    .venv\\Scripts\\python.exe tests\\identity_test.py

Freezes app/graph_identity.py: the canonicalization (accents, dashes, whitespace,
casing), the per-format key derivation, the "incomplete people key is None" rule,
and the within-format collision check. Same throwaway-DB pattern as
security_test.py so the collision check runs against a real session.
"""

import os
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _throwaway_db  # noqa: F401 -- must run before any app import

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.graph_identity import (  # noqa: E402
    find_identity_collisions,
    normalize_identity,
    post_identity_key,
)
from app.models import Post  # noqa: E402

Base.metadata.create_all(bind=engine)

PASS = 0


def check(name: str, condition: bool, detail: str = ""):
    global PASS
    assert condition, f"FAIL: {name} {detail}"
    PASS += 1
    print(f"ok: {name}")


# --- canonicalization ------------------------------------------------------

# Accented / non-Latin names normalize stably and idempotently.
sklod_key = normalize_identity("Skłodowska")
check("normalize idempotent", normalize_identity(sklod_key) == sklod_key, sklod_key)
check("normalize lowercases", sklod_key == sklod_key.lower())
check("non-Latin stable (Laozi)", normalize_identity("Laozi") == "laozi")
check("CJK passes through stably", normalize_identity("老子") == normalize_identity("老子"))

# NFC (composed) and NFD (decomposed) forms of the same accented name collapse.
composed = unicodedata.normalize("NFC", "Crème")
decomposed = unicodedata.normalize("NFD", "Crème")
check(
    "NFC vs NFD fold to one key",
    normalize_identity(composed) == normalize_identity(decomposed) == "creme",
)

# Hyphen vs en-dash and surrounding/internal whitespace.
check("en-dash == hyphen", normalize_identity("Anti–War") == normalize_identity("Anti-War"))
check("whitespace trimmed", normalize_identity("  Scale  ") == "scale")
check(
    "internal whitespace collapsed + casing irrelevant",
    normalize_identity("Scale by Geoffrey West") == normalize_identity("scale  by  geoffrey west"),
)

# --- per-format derivation -------------------------------------------------

check(
    "books key = 'title by author'",
    post_identity_key("books", {"title": "Scale", "author": "Geoffrey West"})
    == "scale by geoffrey west",
)
check(
    "people key = 'name (birth_year)'",
    post_identity_key("people", {"name": "Marie Skłodowska", "birth_year": 1867})
    == normalize_identity("Marie Skłodowska (1867)"),
)
check(
    "people birth_year coerced from numeric string",
    post_identity_key("people", {"name": "Lise Meitner", "birth_year": "1878"})
    == post_identity_key("people", {"name": "Lise Meitner", "birth_year": 1878}),
)
check(
    "facts key = normalized headline",
    post_identity_key("facts", {"headline": "Honey Never Spoils"}) == "honey never spoils",
)
check(
    "concepts key = normalized concept_name",
    post_identity_key("concepts", {"concept_name": "Regression to the Mean"})
    == "regression to the mean",
)

# --- incomplete people key is None, never a partial / name-only key ---------

check(
    "people missing birth_year -> None",
    post_identity_key("people", {"name": "Lise Meitner"}) is None,
)
check(
    "people non-coercible birth_year -> None",
    post_identity_key("people", {"name": "Lise Meitner", "birth_year": "unknown"}) is None,
)
check(
    "people missing name -> None",
    post_identity_key("people", {"birth_year": 1878}) is None,
)
check(
    "books missing author -> None",
    post_identity_key("books", {"title": "Scale"}) is None,
)

# --- collision check (real session) ----------------------------------------

db = SessionLocal()


def add_post(fmt, feed_card):
    post = Post(
        format=fmt,
        title=feed_card.get("title") or feed_card.get("name") or feed_card.get("headline") or "x",
        identity_key=post_identity_key(fmt, feed_card),
        feed_card=feed_card,
        sections=[],
        is_user_content=False,
    )
    db.add(post)
    db.commit()
    return post


# Two same-format posts with identical parts collide.
add_post("books", {"title": "Scale", "author": "Geoffrey West"})
add_post("books", {"title": "scale", "author": "geoffrey  west"})
# A different format sharing the title does not collide with the books pair.
add_post("concepts", {"concept_name": "Scale"})
# Two people both missing birth_year must NOT collide on name alone (both None).
add_post("people", {"name": "Anon Person"})
add_post("people", {"name": "Anon Person"})

collisions = find_identity_collisions(db)
collision_formats = {fmt for fmt, _key, _ids in collisions}

check("identical-parts same-format posts collide", ("books", "scale by geoffrey west") in {(f, k) for f, k, _ in collisions})
check("same title across formats does not collide", "concepts" not in collision_formats)
check("people missing birth_year do not collide on name alone", "people" not in collision_formats)
check("exactly one collision group", len(collisions) == 1, str(collisions))

db.close()

print(f"\nAll {PASS} identity checks passed.")
