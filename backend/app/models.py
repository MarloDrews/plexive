# SCHEMA CHANGES GO THROUGH ALEMBIC AS OF 2026-08-28 (backend/alembic/).
# alembic/versions/0001_baseline.py describes this file as it stood then, so a
# column added here without a migration is drift, not a change.
#
# Before changing a column, two things worth knowing:
#   - Autogenerate CANNOT detect a rename. It renders one as a drop plus an add,
#     which destroys that column's data. Rename by hand, with op.alter_column.
#   - The live database WAS reconciled against this file on 2026-08-28, and the
#     answer was that production was right and the declarations were wrong: it
#     had jsonb where this file said JSON, TEXT where it said String, and a
#     unique index where it said a unique constraint. Those six differences are
#     gone, fixed HERE and never in the database. Three remain by decision --
#     ix_follows_id, ix_quiz_answers_user_id and
#     ix_conversation_participants_conversation_id, each recorded next to its
#     table -- so schema_diff.py reports 3, not 0, until the DROP INDEX
#     migration runs. Any FOURTH entry is new drift.
#     Ask, do not assume: .venv\Scripts\python.exe scripts\schema_diff.py
#
# The cross-repository column contract that nothing gates is recorded next to
# the columns it names, on posts.thumbnail_url below.

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Table, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from .database import Base
from .time_utils import utcnow

post_interests = Table(
    "post_interests",
    Base.metadata,
    Column("post_id", Integer, ForeignKey("posts.id"), primary_key=True),
    Column("interest_id", Integer, ForeignKey("interests.id"), primary_key=True),
)


class Interest(Base):
    __tablename__ = "interests"

    id   = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    slug = Column(String, unique=True, nullable=False)


class Post(Base):
    __tablename__ = "posts"

    id         = Column(Integer, primary_key=True)
    format     = Column(String, nullable=False, index=True)
    title      = Column(String, nullable=False)
    # json, NOT jsonb, on both sides -- and that is an accident of mechanism
    # rather than a decision. These two came with the table from create_all,
    # which renders Column(JSON) as PostgreSQL json; the four jsonb columns below
    # were added later by hand-written scripts that typed JSONB themselves.
    # Nobody ever compared the two. Left alone deliberately, because feed_card is
    # the one JSON column the app actually queries (routers/search.py casts it to
    # Text and runs ILIKE over it) and jsonb's cast to text is NORMALIZED --
    # reordered keys, whitespace stripped -- so switching it would silently
    # change which search strings match. That is a search decision, not a schema
    # tidy-up. Measured on production 2026-08-28: both report json, atttypmod -1.
    feed_card  = Column(JSON, nullable=False)
    sections   = Column(JSON, nullable=False)
    # Graph fields: top-level taxonomy slugs and cross-post links. Added to the
    # live DB by scripts/add_graph_columns.py:29-30, which issued JSONB -- so
    # jsonb is what production has always had, and this declaration follows it.
    # The models are the wrong side here, never the database: an ALTER TYPE on a
    # populated column rewrites the table.
    #
    # .with_variant is load-bearing, not decoration. Every suite runs on SQLite
    # (tests/_throwaway_db.py:24) and SQLite cannot render JSONB, so a bare JSONB
    # would break create_all and take out all 16 of them. Same dialect-split
    # pattern as uq_events_user_like's postgresql_where/sqlite_where below.
    # Nothing in app/ uses a jsonb operator today; declaring it is what makes
    # containment and GIN indexing reachable if anything ever wants them.
    tags        = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False, default=list)
    connections = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False, default=list)
    author_id  = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    status     = Column(String, nullable=False, default="published", index=True)
    created_at = Column(DateTime, default=utcnow, index=True)

    # Stable per-post identity for seed/official content (the JSON filename stem).
    # NULL for user-created posts. Unique so the seed upsert can key on it and
    # re-runs update each post in place instead of duplicating. Added to the live
    # DB by scripts/add_slug_column.py.
    slug = Column(String, nullable=True, unique=True, index=True)

    # Normalized graph identity for this post (see app/graph_identity.py),
    # computed on write from the format-specific feed_card parts. NULL when those
    # parts are missing (e.g. a people post without birth_year) -- the post is
    # then not resolvable as a connection target yet. Indexed, not unique:
    # within-format collisions are flagged for a human, not enforced. Added to the
    # live DB by scripts/add_identity_and_edges.py.
    identity_key = Column(String, nullable=True, index=True)

    # Reading time in minutes, computed from the section text on write
    # (app/reading_time.py stays the single computation source; posts.py and
    # seed.py call it). Stored so list endpoints never walk the sections JSON
    # per request. NULL only for rows written before the column existed --
    # scripts/add_reading_minutes.py backfills those on the live DB.
    reading_minutes = Column(Integer, nullable=True)

    # False for official/seed content; True for user submissions.
    # Cannot be derived from author_id because seed posts also have an author.
    is_user_content = Column(Boolean, nullable=False, default=False)

    # CROSS-REPOSITORY CONTRACT -- DO NOT RENAME THESE TWO COLUMNS CASUALLY.
    # The thumbnail render subsystem moved to a separate private repository on
    # 2026-08-28. Its generate_thumbnails.py no longer imports this model; it
    # reaches the database directly and names four columns in plain SQL:
    # posts.id, posts.slug, posts.thumbnail_spec (all read) and
    # posts.thumbnail_url (written). Renaming or dropping any of the four breaks
    # that script, and NOTHING HERE WILL CATCH IT -- no test, no gate and no
    # import references it any more, because that is the point of the split.
    # The matching warning is in that script's own header.

    # Public Supabase Storage URL of this post's own 16:9 thumbnail. NULL until
    # one was generated or uploaded -- the card then falls back to the shared
    # placeholder image. Added to the live DB by scripts/add_thumbnail_columns.py.
    # Written offline by the private renderer; nothing in this repository sets it.
    # Text rather than String because scripts/add_thumbnail_columns.py:31 issued
    # TEXT. PostgreSQL treats an unbounded VARCHAR and TEXT identically -- both
    # atttypmod -1, same storage class, implicit cast, measured 2026-08-28 -- so
    # this aligns the declaration with production and changes nothing else.
    thumbnail_url = Column(Text, nullable=True)

    # How this post's thumbnail is produced, e.g.
    # {"generator": "geography", "place": "Mediterranean Sea", "caption": "...",
    #  "palette": "blue"}. Authored in the post JSON under "thumbnail", stored
    # here by seed.py as opaque JSON (this backend never validates or renders
    # it), and read by the private renderer so it can re-render from the DB
    # alone. The generator names are catalogued in that repository.
    # jsonb in production since scripts/add_thumbnail_columns.py:32; variant-typed
    # for the same SQLite reason as tags/connections above. NOTE that no test
    # exercises this column at all -- "thumbnail" appears nowhere in backend/tests/
    # -- so a green suite says nothing about it, which is the same gap the
    # cross-repository warning above describes.
    thumbnail_spec = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=True)

    interests = relationship("Interest", secondary=post_interests)
    author    = relationship("User", back_populates="posts", foreign_keys=[author_id])

    @property
    def author_username(self):
        return self.author.username if self.author else None

    @property
    def author_is_verified(self):
        return bool(self.author.is_verified) if self.author else None

    @property
    def author_avatar_url(self):
        return self.author.avatar_url if self.author else None

    @property
    def author_avatar_frame_id(self):
        return self.author.avatar_frame_id if self.author else None


class PostEdge(Base):
    __tablename__ = "post_edges"
    # A directed link one post declares to another. target_post_id is NULL until
    # the target identity_key resolves to a real post (Block 2). PostgreSQL does
    # not auto-index FK columns, so the source/target lookups need explicit
    # indexes (same pattern as Event/Follow). Created on the live DB by
    # scripts/add_identity_and_edges.py.
    __table_args__ = (
        Index("ix_post_edges_source_post_id", "source_post_id"),
        Index("ix_post_edges_target_format_identity", "target_format", "target_identity_key"),
        Index("ix_post_edges_target_post_id", "target_post_id"),
    )

    id                  = Column(Integer, primary_key=True)
    source_post_id      = Column(Integer, ForeignKey("posts.id"), nullable=False)
    target_format       = Column(String, nullable=False)
    target_identity_key = Column(String, nullable=False)
    target_post_id      = Column(Integer, ForeignKey("posts.id"), nullable=True)
    featured            = Column(Boolean, nullable=False, default=False)
    kind                = Column(String, nullable=False, default="related")
    created_at          = Column(DateTime, default=utcnow)


class Event(Base):
    __tablename__ = "events"
    # PostgreSQL does not index FK columns automatically. Like counts and
    # dedup checks filter on (post_id, event_type); scoring filters on
    # created_at; per-user queries filter on user_id. create_all only adds
    # these on fresh databases - scripts/add_indexes.py applies them to the
    # existing one.
    __table_args__ = (
        Index("ix_events_post_id_event_type", "post_id", "event_type"),
        # Structural like dedup (M119): at most one like per (user, post). Partial
        # so views/unlikes and anonymous rows are unconstrained. create_all adds
        # it on fresh DBs; scripts/add_like_unique_index.py applies it to the
        # live one (after removing anonymous likes and existing duplicates).
        Index(
            "uq_events_user_like",
            "user_id",
            "post_id",
            unique=True,
            postgresql_where=text("event_type = 'like' AND user_id IS NOT NULL"),
            sqlite_where=text("event_type = 'like' AND user_id IS NOT NULL"),
        ),
    )

    id          = Column(Integer, primary_key=True)
    post_id     = Column(Integer, ForeignKey("posts.id"), nullable=False)
    event_type  = Column(String, nullable=False)
    duration_ms = Column(Integer, nullable=True)
    created_at  = Column(DateTime, default=utcnow, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True)
    email         = Column(String, unique=True, nullable=False, index=True)
    username      = Column(String, unique=True, nullable=False)
    # Nullable since M-google: accounts created via Google sign-in have no
    # password. A NULL hash means "no password set"; verify_password treats it as
    # never matching, so such accounts can only sign in through Google.
    password_hash = Column(String, nullable=True)
    # Google account subject id ("sub" claim) for accounts that use Google
    # sign-in. Stable per Google account and never reused, so it is the durable
    # link even if the user later changes their Google email. NULL for
    # password-only accounts. Added to the live DB by
    # scripts/add_google_auth_columns.py.
    google_sub    = Column(String, unique=True, nullable=True, index=True)
    created_at    = Column(DateTime, default=utcnow)
    is_active     = Column(Boolean, default=True, nullable=False)
    # Cosmetic verification badge ONLY (0/1/2). Split from the two capabilities
    # below in M116 so the badge no longer implies publish or admin rights.
    # Added to the live DB by scripts/add_capability_columns.py.
    is_verified   = Column(Integer, default=0, nullable=False)
    # can_publish: this user's posts publish immediately instead of landing in
    # the pending queue (consumed only by posts.create_post). Granted
    # deliberately, back-filled to already-verified users by the migration so
    # their behavior does not change. is_admin: may verify other users and
    # release pending posts (admin router only); the owner is the sole admin at
    # launch. Both added to the live DB by scripts/add_capability_columns.py.
    can_publish   = Column(Boolean, default=False, nullable=False)
    is_admin      = Column(Boolean, default=False, nullable=False)
    is_private    = Column(Boolean, default=False, nullable=False)
    bio           = Column(String, nullable=True)
    avatar_url    = Column(String, nullable=True)

    # Cosmetic accessories, purely decorative and never a capability gate.
    # avatar_frame_id: the overlay circle drawn on top of the profile picture.
    # badge_id: the Arena (ranked) waiting-room tile artwork.
    # The frontend owns the id -> artwork mapping (lib/accessories.ts); the
    # backend only stores and serves the number, so adding a design needs no
    # backend change. NULL -- or any id the frontend does not know -- renders
    # the default look, which keeps an unknown value harmless rather than
    # breaking the avatar. Nothing in the UI writes these yet: they are set by
    # hand in the DB. Added to the live DB by scripts/add_accessory_columns.py.
    avatar_frame_id = Column(Integer, nullable=True)
    badge_id        = Column(Integer, nullable=True)

    # Single unified knowledge score (the "Knowledge score" and the Train Elo are
    # the same number). NULL until the user's first scored answer, then it behaves
    # like a 1000-start Elo. answered_count drives the provisional/stable K-factor
    # and counts every scored answer (post quizzes + Train), see app/elo.py.
    knowledge_rating         = Column(Float, nullable=True)
    knowledge_answered_count = Column(Integer, nullable=False, default=0)

    # Monotonic token version embedded in each JWT as the "ver" claim and checked
    # on decode (M126/SEC-012). Bumped on password change so existing tokens stop
    # validating -- a stolen token dies when the victim changes their password.
    # A token minted before the claim existed carries ver 0, matching the
    # default, so nobody is logged out by adding the column. Added to the live DB
    # by scripts/add_token_version.py.
    token_version            = Column(Integer, nullable=False, default=0)

    posts = relationship("Post", back_populates="author", foreign_keys="Post.author_id")

    @property
    def has_google(self) -> bool:
        # Whether a Google account is connected. Read by UserOut (from_attributes)
        # so the profile UI can show "Connected" instead of the connect button;
        # never exposes the google_sub value itself.
        return self.google_sub is not None


class Follow(Base):
    __tablename__ = "follows"
    # uq_follow already serves follower_id-prefixed lookups; follower counts
    # filter on (following_id, status) and need their own index.
    #
    # PRODUCTION ALSO CARRIES ix_follows_id ON (id), WHICH IS NOT DECLARED HERE
    # AND IS NOT A MISTAKE. create_all built it from an index=True flag that
    # ada78e5 (2026-07-06) removed from the id column as redundant -- id is the
    # primary key and already indexed. That commit changed the declaration only
    # and said dropping the live index was "a separate manual op"; the op was
    # never run, so the index has outlived its declaration. It is therefore
    # PENDING A DROP INDEX MIGRATION, committed to as the first real migration
    # after the stamp. Until that runs, schema_diff.py and alembic check both
    # report it as EXTRA IN THE DATABASE, and that entry is expected.
    # The same applies to ix_quiz_answers_user_id and
    # ix_conversation_participants_conversation_id below.
    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_follow"),
        Index("ix_follows_following_id_status", "following_id", "status"),
    )

    id           = Column(Integer, primary_key=True)
    follower_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    following_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status       = Column(String, default="accepted", nullable=False)
    created_at   = Column(DateTime, default=utcnow)

    follower  = relationship("User", foreign_keys=[follower_id])
    following = relationship("User", foreign_keys=[following_id])


# NOTE: the old per-format `user_elo` table has been replaced by the single
# `users.knowledge_rating` column (see User above). The legacy table is left in
# the database for now (non-destructive) but is no longer modeled or used.


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"
    # PRODUCTION ALSO CARRIES ix_quiz_answers_user_id ON (user_id), UNDECLARED ON
    # PURPOSE. uq_quiz_answer leads with user_id, so a btree on that triple
    # already serves user_id-prefixed lookups and the standalone index buys
    # nothing. create_all built it from an index=True flag ada78e5 (2026-07-06)
    # removed for exactly that reason, leaving the live index behind as "a
    # separate manual op" nobody ran. Pending a DROP INDEX migration, committed
    # to as the first migration after the stamp; see Follow above.
    __table_args__ = (
        UniqueConstraint("user_id", "post_id", "question_index", name="uq_quiz_answer"),
    )

    id             = Column(Integer, primary_key=True)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False)
    post_id        = Column(Integer, ForeignKey("posts.id"), nullable=False, index=True)
    question_index = Column(Integer, nullable=False)
    chosen_index   = Column(Integer, nullable=False)
    is_correct     = Column(Boolean, nullable=False)
    rating_delta   = Column(Float, nullable=False, default=0.0)
    created_at     = Column(DateTime, default=utcnow)


class Conversation(Base):
    __tablename__ = "conversations"
    # A named unique INDEX, not an inline unique=True on the column, because that
    # is what production enforces: scripts/add_conversation_dm_key.py:81 issued
    # CREATE UNIQUE INDEX uq_conversations_dm_key. Read off the live catalog
    # 2026-08-28 -- pg_index reports indisunique with NO backing pg_constraint
    # row, against conversations_pkey in the same query which does have one. Same
    # guarantee either way (PostgreSQL implements a unique constraint AS a unique
    # index); the difference was only ever the object kind and the name, which is
    # why alembic reported it twice, as an add_constraint plus a remove_index.
    __table_args__ = (
        Index("uq_conversations_dm_key", "dm_key", unique=True),
    )

    id         = Column(Integer, primary_key=True)
    is_group   = Column(Boolean, nullable=False, default=False)
    # Group display name; NULL for direct messages (name derived from the other user).
    name       = Column(String, nullable=True)
    # Canonical DM pair key "loUserId:hiUserId", NULL for groups. Unique so two
    # concurrent "message X" taps cannot fork a pair into two conversations
    # (M145/BUG-036): the loser's INSERT hits the constraint and returns the
    # winner's conversation. Added to the live DB (plus backfill) by
    # scripts/add_conversation_dm_key.py. The uniqueness is declared as an index
    # in __table_args__ above, not as unique=True here. NULLs stay distinct under
    # both PostgreSQL and SQLite, so group conversations are unconstrained.
    dm_key     = Column(String, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow)

    participants = relationship("ConversationParticipant", back_populates="conversation")


class ConversationParticipant(Base):
    __tablename__ = "conversation_participants"
    # PRODUCTION ALSO CARRIES ix_conversation_participants_conversation_id,
    # UNDECLARED ON PURPOSE. uq_conversation_participant leads with
    # conversation_id, so it already serves conversation_id-prefixed lookups.
    # create_all built the standalone index from an index=True flag ada78e5
    # (2026-07-06) removed as redundant, leaving the live index behind as "a
    # separate manual op" nobody ran. Pending a DROP INDEX migration, committed
    # to as the first migration after the stamp; see Follow above.
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_conversation_participant"),
    )

    id              = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    joined_at       = Column(DateTime, default=utcnow)

    conversation = relationship("Conversation", back_populates="participants")
    user         = relationship("User")


class Message(Base):
    __tablename__ = "messages"
    # The history query filters conversation_id and keysets on id, so the
    # composite serves it exactly. create_all only adds this on fresh
    # databases - scripts/add_comment_message_indexes.py applies it to the
    # existing one.
    __table_args__ = (
        Index("ix_messages_conversation_id_id", "conversation_id", "id"),
    )

    id              = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False, index=True)
    sender_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    body            = Column(Text, nullable=False)
    created_at      = Column(DateTime, default=utcnow, index=True)

    sender = relationship("User")


class Comment(Base):
    __tablename__ = "comments"
    # list_comments filters post_id and orders by created_at, so the composite
    # avoids a sort after the index scan. create_all only adds this on fresh
    # databases - scripts/add_comment_message_indexes.py applies it to the
    # existing one.
    __table_args__ = (
        Index("ix_comments_post_id_created_at", "post_id", "created_at"),
    )

    id         = Column(Integer, primary_key=True)
    post_id    = Column(Integer, ForeignKey("posts.id"), nullable=False, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    body       = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User")
