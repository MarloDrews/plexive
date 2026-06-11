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
    author_id  = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    status     = Column(String, nullable=False, default="published", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

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

    posts = relationship("Post", back_populates="author", foreign_keys="Post.author_id")


class Follow(Base):
    __tablename__ = "follows"
    # uq_follow already serves follower_id-prefixed lookups; follower counts
    # filter on (following_id, status) and need their own index.
    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_follow"),
        Index("ix_follows_following_id_status", "following_id", "status"),
    )

    id           = Column(Integer, primary_key=True, index=True)
    follower_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    following_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status       = Column(String, default="accepted", nullable=False)
    created_at   = Column(DateTime, default=datetime.utcnow)

    follower  = relationship("User", foreign_keys=[follower_id])
    following = relationship("User", foreign_keys=[following_id])


class UserElo(Base):
    __tablename__ = "user_elo"
    __table_args__ = (UniqueConstraint("user_id", "format", name="uq_user_elo"),)

    id             = Column(Integer, primary_key=True)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    format         = Column(String, nullable=False)
    rating         = Column(Float, nullable=False, default=1000.0)
    answered_count = Column(Integer, nullable=False, default=0)


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"
    __table_args__ = (
        UniqueConstraint("user_id", "post_id", "question_index", name="uq_quiz_answer"),
    )

    id             = Column(Integer, primary_key=True)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
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
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    joined_at       = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="participants")
    user         = relationship("User")


class Message(Base):
    __tablename__ = "messages"

    id              = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False, index=True)
    sender_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    body            = Column(Text, nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow, index=True)

    sender = relationship("User")


class Comment(Base):
    __tablename__ = "comments"

    id         = Column(Integer, primary_key=True)
    post_id    = Column(Integer, ForeignKey("posts.id"), nullable=False, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    body       = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
