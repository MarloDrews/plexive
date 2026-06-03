from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Table, Text, UniqueConstraint
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

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    slug = Column(String, unique=True, nullable=False)


# details JSON column — expected keys per format:
#   books:     author, isbn, publication_year, core_thesis, who_should_read
#              (image_url holds the Open Library cover)
#   facts:     stat, context, why_it_matters, visual_svg, visual_type
#   people:    lifespan, known_for, field, turning_point, legacy, wikipedia_url
#              (image_url + image_attribution expected to always be filled — Wikipedia portrait)
#   concepts:  one_line_definition, explanation, concrete_example, how_to_apply,
#              related_concepts, visual_svg, visual_type
#              (details.visual_svg holds a raw inline SVG string)
#   questions: the_question, framing, perspectives (list), reflection_prompt
#   stories:   setting, narrative, the_twist, aftermath
class Post(Base):
    __tablename__ = "posts"

    id = Column(Integer, primary_key=True)
    format = Column(String, nullable=False)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)  # deprecated: use hook/key_points/takeaway/details instead
    source = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    hook               = Column(String, nullable=True)
    key_points         = Column(JSON,   nullable=True)
    takeaway           = Column(String, nullable=True)
    source_url         = Column(String, nullable=True)
    image_url          = Column(String, nullable=True)
    image_attribution  = Column(String, nullable=True)
    related_slugs      = Column(JSON,   nullable=True)
    details            = Column(JSON,   nullable=True)

    author_id  = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    status     = Column(String, nullable=False, default="published")
    image_path = Column(String, nullable=True)

    interests = relationship("Interest", secondary=post_interests)
    author    = relationship("User", back_populates="posts", foreign_keys=[author_id])

    @property
    def author_username(self):
        return self.author.username if self.author else None

    @property
    def author_is_verified(self):
        return self.author.is_verified if self.author else None


class Event(Base):
    __tablename__ = "events"

    id          = Column(Integer, primary_key=True)
    post_id     = Column(Integer, ForeignKey("posts.id"), nullable=False)
    event_type  = Column(String, nullable=False)
    duration_ms = Column(Integer, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=True)


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True)
    email         = Column(String, unique=True, nullable=False, index=True)
    username      = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow)
    is_active     = Column(Boolean, default=True, nullable=False)
    is_verified   = Column(Boolean, default=False, nullable=False)
    is_private    = Column(Boolean, default=False, nullable=False)
    bio           = Column(String, nullable=True)

    posts = relationship("Post", back_populates="author", foreign_keys="Post.author_id")


class Follow(Base):
    __tablename__ = "follows"
    __table_args__ = (UniqueConstraint("follower_id", "following_id", name="uq_follow"),)

    id           = Column(Integer, primary_key=True, index=True)
    follower_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    following_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # "pending" = request sent but not yet accepted; "accepted" = following is active
    status       = Column(String, default="accepted", nullable=False)
    created_at   = Column(DateTime, default=datetime.utcnow)

    follower  = relationship("User", foreign_keys=[follower_id])
    following = relationship("User", foreign_keys=[following_id])


class Comment(Base):
    __tablename__ = "comments"

    id         = Column(Integer, primary_key=True)
    post_id    = Column(Integer, ForeignKey("posts.id"), nullable=False)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    body       = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
