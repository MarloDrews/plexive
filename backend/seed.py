import getpass
import json
import os
import sys

from dotenv import load_dotenv

from app.auth import hash_password
from app.database import Base, SessionLocal, engine
from app.graph_edges import on_post_written
from app.graph_identity import post_identity_key
from app.models import Interest, Post, User
from app.reading_time import compute_reading_minutes
from content_repo import resolve_examples

Base.metadata.create_all(bind=engine)

SLUGS = [
    "physics", "quantum-physics", "astronomy", "cosmology", "chemistry",
    "biology", "genetics", "neuroscience", "evolution", "ecology", "climate",
    "geology", "oceans", "animals", "paleontology", "botany", "microbiology",
    "mathematics", "statistics", "medicine",
    "materials-science", "artificial-intelligence", "machine-learning",
    "computing", "internet", "cybersecurity", "robotics", "biotech",
    "space-tech", "energy-tech", "engineering", "gadgets", "cryptography",
    "blockchain", "aviation", "transportation", "economics",
    "behavioral-economics", "finance", "entrepreneurship", "startups",
    "marketing", "management", "negotiation", "money-history", "markets",
    "career", "productivity-work", "supply-chains", "advertising",
    "psychology", "cognitive-biases", "habits", "productivity", "focus",
    "motivation", "decision-making", "emotional-intelligence", "mental-health",
    "mindfulness", "happiness", "relationships", "communication", "learning",
    "creativity",
    "discipline", "confidence", "stoicism-practice", "philosophy", "ethics",
    "stoicism", "existentialism", "eastern-philosophy", "logic", "epistemology",
    "consciousness", "free-will", "political-philosophy", "philosophy-of-mind",
    "meaning", "mental-models", "ancient-history", "medieval-history",
    "modern-history", "world-wars", "cold-war", "empires", "revolutions",
    "ancient-egypt", "ancient-rome", "ancient-greece", "exploration",
    "archaeology", "history-of-science", "forgotten-history", "military-history",
    "politics", "geopolitics", "political-systems", "democracy", "law",
    "human-rights", "social-movements", "inequality", "propaganda", "diplomacy",
    "elections", "public-policy", "art-history", "music", "music-theory",
    "literature", "film", "architecture", "design", "photography", "writing",
    "mythology", "religion", "language", "poetry", "theater", "nutrition",
    "fitness", "sleep", "longevity", "human-body", "brain-health", "immunity",
    "public-health", "sports-science", "everyday-science", "food-science",
    "games", "sports", "travel", "nature-phenomena", "curiosities", "future",
    "internet-culture", "crime", "money-everyday", "history", "anthropology",
    "exponential-growth", "patience", "critical-thinking", "trade-offs",
    "scarcity",
]

_SMALL_WORDS = {"of", "and", "the", "in", "to", "a", "for", "on", "at", "by", "with", "or", "as", "vs"}

NAME_EXCEPTIONS = {
    "money-everyday": "Personal Finance",
    "trade-offs": "Trade-offs",
}

SEED_EMAIL = "marlo07drews@gmail.com"
SEED_USERNAME = "Marlo"

# Per-format fallback interests, used only when a post has no tags that map to an
# interest (see _resolve_interests). Add an entry when a new format is introduced.
FORMAT_INTEREST_SLUGS = {
    "books": ["psychology", "behavioral-economics", "decision-making", "neuroscience"],
    "facts": ["biology", "animals", "everyday-science"],
    "people": ["physics", "history-of-science", "world-wars"],
    "concepts": ["mental-models", "critical-thinking", "epistemology"],
    "questions": ["philosophy", "ethics", "critical-thinking", "epistemology"],
    "stories": ["history", "crime", "forgotten-history"],
    "academy": ["neuroscience", "philosophy-of-mind", "mathematics", "artificial-intelligence"],
}


def _resolve_interests(db, tags, post_format):
    """Interests for a post, derived from its own taxonomy tags.

    Tags are drawn from the canonical taxonomy, which is the same vocabulary as
    the interest slugs, so each tag maps directly to an Interest row. Falls back
    to the per-format default only when none of the post's tags resolve (e.g. a
    legacy post with empty tags), so chips always match the post's real subject.
    """
    interests = []
    for tag in tags:
        interest = db.query(Interest).filter_by(slug=tag).first()
        if interest:
            interests.append(interest)

    if interests:
        return interests

    # Fallback: generic per-format default (previous behavior).
    for interest_slug in FORMAT_INTEREST_SLUGS.get(post_format, []):
        interest = db.query(Interest).filter_by(slug=interest_slug).first()
        if interest:
            interests.append(interest)
        else:
            print(f"Warning: interest slug '{interest_slug}' not found, skipping")
    return interests


def _post_title(feed_card: dict) -> str:
    """Extract the display title from a feed_card regardless of format."""
    return (
        feed_card.get("title")
        or feed_card.get("concept_name")
        or feed_card.get("the_question")
        or feed_card.get("headline")
        or feed_card.get("name")
        or ""
    )


def slug_to_name(slug):
    if slug in NAME_EXCEPTIONS:
        return NAME_EXCEPTIONS[slug]
    words = slug.split("-")
    return " ".join(
        w.capitalize() if i == 0 or w not in _SMALL_WORDS else w
        for i, w in enumerate(words)
    )


def _slug_from_filename(filename: str) -> str:
    """Stable per-post identity = the JSON filename without its extension.

    Examples: facts_example.json -> facts_example;
    banks-create-most-money.json -> banks-create-most-money.
    """
    return os.path.splitext(filename)[0]


def upsert_post(db, marlo, post_format, data, slug, allow_legacy_adopt):
    """Create or update one post, keyed on the unique slug.

    allow_legacy_adopt is set only for the example posts: if no row matches the
    slug yet, adopt the pre-slug example row (same author+format, slug still NULL)
    and backfill its slug. This is a one-time transition so existing live example
    posts are updated in place rather than duplicated. Restricting the fallback to
    slug=None means generated posts (always created with a slug) are never adopted
    by accident.
    """
    feed_card = data["feed_card"]
    sections = data["sections"]
    tags = data.get("tags", [])
    connections = data.get("connections", [])
    # Optional: how this post's thumbnail is rendered. The image itself is
    # produced later by the private content repository's renderer, never here
    # (the render subsystem left this repository on 2026-08-28) -- seeding
    # must stay offline and fast.
    thumbnail_spec = data.get("thumbnail")
    title = _post_title(feed_card)
    identity_key = post_identity_key(post_format, feed_card)
    interests = _resolve_interests(db, tags, post_format)

    existing = db.query(Post).filter_by(slug=slug).first()
    if existing is None and allow_legacy_adopt:
        existing = (
            db.query(Post)
            .filter_by(author_id=marlo.id, format=post_format, slug=None)
            .first()
        )

    if existing:
        existing.slug = slug
        existing.title = title
        existing.identity_key = identity_key
        existing.feed_card = feed_card
        existing.sections = sections
        existing.reading_minutes = compute_reading_minutes(sections)
        existing.tags = tags
        existing.connections = connections
        existing.interests = interests
        existing.status = "published"
        # Drop the rendered image ONLY when the spec actually changed, so a
        # routine re-seed never throws away a generated thumbnail. The next
        # run of the private renderer then picks the post up again.
        if existing.thumbnail_spec != thumbnail_spec:
            existing.thumbnail_spec = thumbnail_spec
            existing.thumbnail_url = None
        # Rebuild this post's edges and activate any latent edges pointing at
        # it, then ONE commit so post + edges land atomically (M149/BE-013).
        on_post_written(db, existing)
        db.commit()
        print(f"Updated existing {post_format.title()} post: {title}.")
        return

    post = Post(
        slug=slug,
        format=post_format,
        title=title,
        identity_key=identity_key,
        feed_card=feed_card,
        sections=sections,
        reading_minutes=compute_reading_minutes(sections),
        tags=tags,
        connections=connections,
        thumbnail_spec=thumbnail_spec,
        author_id=marlo.id,
        status="published",
        is_user_content=False,
    )
    post.interests = interests
    db.add(post)
    # Flush so the row has an id for the edge derivation, then ONE commit so
    # post + edges land atomically (M149/BE-013).
    db.flush()
    on_post_written(db, post)
    db.commit()
    print(f"Seeded {post_format.title()} post: {title}.")


def _get_or_create_marlo(db) -> User:
    marlo = db.query(User).filter_by(email=SEED_EMAIL).first()
    if marlo:
        # Owner is the sole admin and can publish (M116); repair older rows.
        changed = False
        if not marlo.is_verified:
            marlo.is_verified = 2
            changed = True
        if not marlo.is_admin:
            marlo.is_admin = True
            changed = True
        if not marlo.can_publish:
            marlo.can_publish = True
            changed = True
        if changed:
            db.commit()
        return marlo

    # Load seed password from .env; ask for one at the terminal if absent.
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    load_dotenv(env_path)
    password = os.environ.get("SEED_ADMIN_PASSWORD", "").strip()

    if not password:
        # This branch used to generate a password and print it, which is what
        # py/clear-text-logging-sensitive-data flagged: stdout is redirected often enough that the
        # value landed in a file on disk. Relocating the output does not help, because stderr and a
        # file write are sinks of their own. Asking for the password instead means the script has
        # nothing to disclose: the operator already knows it, and getpass does not echo, so it
        # reaches neither the terminal scrollback nor a redirected stream.
        #
        # The no-terminal check comes first. It used to sit after the reveal, so a non-interactive
        # run printed the password and only then refused to continue.
        if not sys.stdin.isatty():
            print(
                "ERROR: SEED_ADMIN_PASSWORD is not set in backend/.env, and there is no terminal\n"
                "       to ask on. Add SEED_ADMIN_PASSWORD=<password> to backend/.env and re-run."
            )
            sys.exit(1)

        print(
            "\n"
            "SEED_ADMIN_PASSWORD is not set in backend/.env.\n"
            "Choose a password for the seed admin account. It is not echoed and never printed.\n"
            "Add SEED_ADMIN_PASSWORD=<password> to backend/.env to skip this prompt next time.\n"
        )
        # EOFError covers the case where getpass cannot control the terminal and falls back to
        # input(), which raises on a closed stdin; without this that surfaces as a traceback
        # instead of the message above. It does NOT cover a Windows dev machine running
        # `seed.py < /dev/null`: isatty() reports NUL as a terminal there (NUL is a character
        # device), so this prompt is reached, and getpass then reads the console rather than
        # stdin and simply waits. Measured, not assumed. That path blocks at a prompt with a
        # human in front of it, so it fails safe, and it does not exist on the Pi, where
        # isatty() answers correctly. Pipes and regular files report correctly on both.
        try:
            password = getpass.getpass("Seed admin password: ")
            repeated = getpass.getpass("Repeat: ")
        except (EOFError, KeyboardInterrupt):
            print(
                "\nERROR: No password was entered, so SEED_ADMIN_PASSWORD is still unset.\n"
                "       Add SEED_ADMIN_PASSWORD=<password> to backend/.env and re-run."
            )
            sys.exit(1)
        if password != repeated:
            print("ERROR: The two entries did not match. Nothing was written.")
            sys.exit(1)
        password = password.strip()
        if not password:
            print("ERROR: An empty password is not accepted. Nothing was written.")
            sys.exit(1)

    marlo = User(
        email=SEED_EMAIL,
        username=SEED_USERNAME,
        password_hash=hash_password(password),
        is_active=True,
        is_verified=2,
        is_admin=True,
        can_publish=True,
    )
    db.add(marlo)
    db.commit()
    db.refresh(marlo)
    print(f"Created user @{SEED_USERNAME} ({SEED_EMAIL})")
    return marlo


# Preflight, before any database work and before the admin-password prompt: an
# unset or misdirected PLEXIVE_CONTENT_REPO stops the run here rather than after
# 149 interests have already been written.
examples_dir, example_files = resolve_examples()

db = SessionLocal()

# Phase 1: get-or-create interests (idempotent)
created_count = 0
for slug in SLUGS:
    if db.query(Interest).filter_by(slug=slug).first() is None:
        db.add(Interest(name=slug_to_name(slug), slug=slug))
        created_count += 1
db.commit()
print(f"Interests: {created_count} created (rest already existed)")

# Phase 2: ensure Marlo exists and is verified
marlo = _get_or_create_marlo(db)

# Phase 3: seed all example posts found in the content repository's
# docs/content-structure/examples/. Any file named <format>_example.json is picked
# up automatically. The examples left this repository on 2026-08-29, so the
# directory is resolved through PLEXIVE_CONTENT_REPO -- the same bridge
# tools/run_pipeline.sh uses. resolve_examples() exits 1 naming the variable when
# it is unset or points somewhere without examples, rather than iterating an empty
# directory and reporting a successful seed.
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

for filename in example_files:
    post_format = filename.replace("_example.json", "")
    with open(os.path.join(examples_dir, filename), encoding="utf-8") as f:
        example = json.load(f)

    upsert_post(
        db,
        marlo,
        post_format,
        example,
        slug=_slug_from_filename(filename),
        allow_legacy_adopt=True,
    )

# Phase 4: seed all generated posts found in docs/content-structure/generated/<format>/
# These did NOT move: generated posts are published content and stay in THIS
# repository, so this path is the local one and PLEXIVE_CONTENT_REPO does not apply.
# The format comes from the folder name (filenames are descriptive slugs). Each
# post is keyed on its filename slug, so re-running updates it in place. Reuses the
# same creator, interest, tag and connection handling as the examples.
generated_dir = os.path.join(project_root, "docs", "content-structure", "generated")

if os.path.isdir(generated_dir):
    for post_format in sorted(os.listdir(generated_dir)):
        format_dir = os.path.join(generated_dir, post_format)
        if not os.path.isdir(format_dir):
            continue

        for filename in sorted(os.listdir(format_dir)):
            if not filename.endswith(".json"):
                continue

            with open(os.path.join(format_dir, filename), encoding="utf-8") as f:
                generated = json.load(f)

            upsert_post(
                db,
                marlo,
                post_format,
                generated,
                slug=_slug_from_filename(filename),
                allow_legacy_adopt=False,
            )

db.close()
