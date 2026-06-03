from datetime import datetime
from typing import List, Literal

from pydantic import BaseModel, ConfigDict, computed_field, field_validator


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    username: str
    created_at: datetime
    is_verified: bool
    is_private: bool
    bio: str | None


class EventIn(BaseModel):
    post_id: int
    event_type: str
    duration_ms: int | None = None


class InterestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str


class PostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    format: str
    title: str
    body: str  # deprecated fallback
    source: str | None
    hook: str | None = None
    key_points: list[str] | None = None
    takeaway: str | None = None
    source_url: str | None = None
    image_url: str | None = None
    image_attribution: str | None = None
    related_slugs: list[str] | None = None
    details: dict | None = None
    interests: List[str]
    author_id: int | None = None
    author_username: str | None = None
    author_is_verified: bool | None = None
    status: str = "published"
    created_at: datetime | None = None

    @computed_field
    @property
    def is_user_content(self) -> bool:
        return self.author_id is not None

    @field_validator("interests", mode="before")
    @classmethod
    def extract_names(cls, v):
        if v and hasattr(v[0], "name"):
            return [interest.name for interest in v]
        return v


class PostCreate(BaseModel):
    format: Literal["books", "facts", "people", "concepts", "questions", "stories"]
    title: str
    hook: str
    key_points: list[str]
    takeaway: str | None = None
    source: str | None = None
    source_url: str | None = None
    interests: list[str]
    image_url: str | None = None
    details: dict | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 200:
            raise ValueError("title must be 1-200 characters")
        return v

    @field_validator("hook")
    @classmethod
    def validate_hook(cls, v: str) -> str:
        if not 1 <= len(v) <= 500:
            raise ValueError("hook must be 1-500 characters")
        return v

    @field_validator("key_points")
    @classmethod
    def validate_key_points(cls, v: list[str]) -> list[str]:
        if not 1 <= len(v) <= 6:
            raise ValueError("key_points must have 1-6 items")
        for point in v:
            if not 1 <= len(point) <= 300:
                raise ValueError("each key point must be 1-300 characters")
        return v

    @field_validator("takeaway")
    @classmethod
    def validate_takeaway(cls, v: str | None) -> str | None:
        if v is not None and len(v) > 500:
            raise ValueError("takeaway must be at most 500 characters")
        return v

    @field_validator("source")
    @classmethod
    def validate_source(cls, v: str | None) -> str | None:
        if v is not None and len(v) > 300:
            raise ValueError("source must be at most 300 characters")
        return v

    @field_validator("source_url")
    @classmethod
    def validate_source_url(cls, v: str | None) -> str | None:
        if v is not None:
            if len(v) > 300:
                raise ValueError("source_url must be at most 300 characters")
            if not (v.startswith("http://") or v.startswith("https://")):
                raise ValueError("source_url must start with http:// or https://")
        return v

    @field_validator("interests")
    @classmethod
    def validate_interests(cls, v: list[str]) -> list[str]:
        if not 1 <= len(v) <= 10:
            raise ValueError("interests must have 1-10 items")
        return v

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, v: str | None) -> str | None:
        if v is not None and not v.startswith("/uploads/"):
            raise ValueError("image_url must reference a file from our upload endpoint (/uploads/...)")
        return v


class UploadResponse(BaseModel):
    url: str


class SvgUploadResponse(BaseModel):
    svg_content: str
