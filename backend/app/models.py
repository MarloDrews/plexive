from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from .database import Base

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
    feed_card  = Column(JSON, nullable=False)
    sections   = Column(JSON, nullable=False)
    # Graph fields: top-level taxonomy slugs and cross-post links. JSON parallels
    # feed_card/sections. Added to the live DB by scripts/add_graph_columns.py.
    tags        = Column(JSON, nullable=False, default=list)
    connections = Column(JSON, nullable=False, default=list)
    author_id  = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    status     = Column(String, nullable=False, default="published", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

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
    created_at          = Column(DateTime, default=datetime.utcnow)


class Event(Base):
    __tablename__ = "events"
    # PostgreSQL does not index FK columns automatically. Like counts and
    # dedup checks filter on (post_id, event_type); scoring filters on
    # created_at; per-user queries filter on user_id. create_all only adds
    # these on fresh databases - scripts/add_indexes.py applies them to the
    # existing one.
    __table_args__ = (
        Index("ix_events_post_id_event_type", "post_id", "event_type"),
    )

    id          = Column(Integer, primary_key=True)
    post_id     = Column(Integer, ForeignKey("posts.id"), nullable=False)
    event_type  = Column(String, nullable=False)
    duration_ms = Column(Integer, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True)
    email         = Column(String, unique=True, nullable=False, index=True)
    username      = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow)
    is_active     = Column(Boolean, default=True, nullable=False)
    is_verified   = Column(Integer, default=0, nullable=False)
    is_private    = Column(Boolean, default=False, nullable=False)
    bio           = Column(String, nullable=True)
    avatar_url    = Column(String, nullable=True)

    # Single unified knowledge score (the "Knowledge score" and the Train Elo are
    # the same number). NULL until the user's first scored answer, then it behaves
    # like a 1000-start Elo. answered_count drives the provisional/stable K-factor
    # and counts every scored answer (post quizzes + Train), see app/elo.py.
    knowledge_rating         = Column(Float, nullable=True)
    knowledge_answered_count = Column(Integer, nullable=False, default=0)

    posts = relationship("Post", back_populates="author", foreign_keys="Post.author_id")


class Follow(Base):
    __tablename__ = "follows"
    # uq_follow already serves follower_id-prefixed lookups; follower counts
    # filter on (following_id, status) and need their own index.
    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_follow"),
        Index("ix_follows_following_id_status", "following_id", "status"),
    )

    id           = Column(Integer, primary_key=True)
    follower_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    following_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status       = Column(String, default="accepted", nullable=False)
    created_at   = Column(DateTime, default=datetime.utcnow)

    follower  = relationship("User", foreign_keys=[follower_id])
    following = relationship("User", foreign_keys=[following_id])


# NOTE: the old per-format `user_elo` table has been replaced by the single
# `users.knowledge_rating` column (see User above). The legacy table is left in
# the database for now (non-destructive) but is no longer modeled or used.


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"
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
    created_at     = Column(DateTime, default=datetime.utcnow)


class Conversation(Base):
    __tablename__ = "conversations"

    id         = Column(Integer, primary_key=True)
    is_group   = Column(Boolean, nullable=False, default=False)
    # Group display name; NULL for direct messages (name derived from the other user).
    name       = Column(String, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    participants = relationship("ConversationParticipant", back_populates="conversation")


class ConversationParticipant(Base):
    __tablename__ = "conversation_participants"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_conversation_participant"),
    )

    id              = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    joined_at       = Column(DateTime, default=datetime.utcnow)

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
    created_at      = Column(DateTime, default=datetime.utcnow, index=True)

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
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
