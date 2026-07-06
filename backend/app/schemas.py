import os
from datetime import datetime
from typing import Annotated, List, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Auth / interests
# ---------------------------------------------------------------------------

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    username: str
    created_at: datetime
    is_verified: int
    is_private: bool
    bio: str | None
    avatar_url: str | None


class EventIn(BaseModel):
    post_id: int
    event_type: str
    duration_ms: int | None = None


class InterestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str


# ---------------------------------------------------------------------------
# Section content sub-models (used in PostCreate validation)
# ---------------------------------------------------------------------------

class VoiceItem(BaseModel):
    quote: str
    attribution: str


class AtAGlanceBooks(BaseModel):
    genre: str
    year: int
    country: str
    pages: int
    reading_ease: int
    post_difficulty: int
    best_for: str

    @field_validator("reading_ease", "post_difficulty")
    @classmethod
    def validate_scale(cls, v: int) -> int:
        if v not in (1, 2, 3):
            raise ValueError("must be 1, 2, or 3")
        return v


class CoreIdeaItem(BaseModel):
    title: str
    body: str
    in_practice: str | None = None
    visual_svg: str | None = None
    image_url: str | None = None
    quote: str | None = None


class TakeawayContent(BaseModel):
    framing: Literal["framework", "question"]
    body: str
    visual_svg: str | None = None


class QuizItem(BaseModel):
    question: str
    options: list[str]
    answer_index: int
    explanation: str

    @field_validator("options")
    @classmethod
    def validate_options(cls, v: list[str]) -> list[str]:
        if len(v) != 4:
            raise ValueError("quiz options must have exactly 4 items")
        return v

    @field_validator("answer_index")
    @classmethod
    def validate_answer_index(cls, v: int) -> int:
        if v not in (0, 1, 2, 3):
            raise ValueError("answer_index must be 0, 1, 2, or 3")
        return v


class SourceItem(BaseModel):
    label: str
    url: str
    type: Literal["wikipedia", "paper", "book", "article", "database"]


class AuthorContextContent(BaseModel):
    body: str
    image_url: str | None = None
    image_attribution: str | None = None
    wikipedia_url: str | None = None


# ---------------------------------------------------------------------------
# Section type models (discriminated union on "type")
# ---------------------------------------------------------------------------

class EssenceSection(BaseModel):
    type: Literal["essence"]
    order: int = Field(ge=1)
    content: str


class VoicesSection(BaseModel):
    type: Literal["voices"]
    order: int = Field(ge=1)
    content: list[VoiceItem]

    @field_validator("content")
    @classmethod
    def validate_voices(cls, v: list[VoiceItem]) -> list[VoiceItem]:
        if not 3 <= len(v) <= 4:
            raise ValueError("voices must have 3 or 4 items")
        return v


class AtAGlanceSection(BaseModel):
    type: Literal["at_a_glance"]
    order: int = Field(ge=1)
    content: dict


class WhyEnduresSection(BaseModel):
    type: Literal["why_endures"]
    order: int = Field(ge=1)
    content: str


class HeartSection(BaseModel):
    type: Literal["heart"]
    order: int = Field(ge=1)
    content: str


class StructureSection(BaseModel):
    type: Literal["structure"]
    order: int = Field(ge=1)
    content: list[str]


class CoreIdeasSection(BaseModel):
    type: Literal["core_ideas"]
    order: int = Field(ge=1)
    content: list[CoreIdeaItem]

    @field_validator("content")
    @classmethod
    def validate_core_ideas(cls, v: list[CoreIdeaItem]) -> list[CoreIdeaItem]:
        if not 6 <= len(v) <= 12:
            raise ValueError(
                f"section 'core_ideas' must have between 6 and 12 items, got {len(v)}"
            )
        return v


class TakeawaySection(BaseModel):
    type: Literal["takeaway"]
    order: int = Field(ge=1)
    content: TakeawayContent


class QuizSection(BaseModel):
    type: Literal["quiz"]
    order: int = Field(ge=1)
    content: list[QuizItem]

    @field_validator("content")
    @classmethod
    def validate_quiz(cls, v: list[QuizItem]) -> list[QuizItem]:
        if not 5 <= len(v) <= 10:
            raise ValueError(
                f"section 'quiz' must have between 5 and 10 questions, got {len(v)}"
            )
        return v


class WorldContextSection(BaseModel):
    type: Literal["world_context"]
    order: int = Field(ge=1)
    content: str


class AuthorContextSection(BaseModel):
    type: Literal["author_context"]
    order: int = Field(ge=1)
    content: AuthorContextContent


class CritiqueSection(BaseModel):
    type: Literal["critique"]
    order: int = Field(ge=1)
    content: str


class SourcesSection(BaseModel):
    type: Literal["sources"]
    order: int = Field(ge=1)
    content: list[SourceItem]

    @field_validator("content")
    @classmethod
    def validate_sources(cls, v: list[SourceItem]) -> list[SourceItem]:
        if not 1 <= len(v) <= 10:
            raise ValueError("sources must have 1-10 items")
        return v


AnySection = Annotated[
    Union[
        EssenceSection,
        VoicesSection,
        AtAGlanceSection,
        WhyEnduresSection,
        HeartSection,
        StructureSection,
        CoreIdeasSection,
        TakeawaySection,
        QuizSection,
        WorldContextSection,
        AuthorContextSection,
        CritiqueSection,
        SourcesSection,
    ],
    Field(discriminator="type"),
]

BOOKS_REQUIRED_SECTIONS = {
    "essence", "voices", "at_a_glance",
    "heart", "core_ideas", "takeaway", "quiz", "sources",
}


# ---------------------------------------------------------------------------
# Feed card models
# ---------------------------------------------------------------------------

class BooksFeedCard(BaseModel):
    cover_url: str | None = None
    title: str
    author: str
    essence: str
    teasers: list[str]
    post_difficulty: int
    year: int
    genre: str

    @field_validator("teasers")
    @classmethod
    def validate_teasers(cls, v: list[str]) -> list[str]:
        if len(v) != 3:
            raise ValueError("teasers must have exactly 3 items")
        return v

    @field_validator("post_difficulty")
    @classmethod
    def validate_difficulty(cls, v: int) -> int:
        if v not in (1, 2, 3):
            raise ValueError("post_difficulty must be 1, 2, or 3")
        return v


# ---------------------------------------------------------------------------
# Post schemas
# ---------------------------------------------------------------------------

class PostCreate(BaseModel):
    format: Literal["books", "facts", "people", "concepts", "questions", "stories", "academy"]
    title: str
    feed_card: dict
    sections: list[AnySection]
    interests: list[str]

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if not 1 <= len(v) <= 200:
            raise ValueError("title must be 1-200 characters")
        return v

    @field_validator("interests")
    @classmethod
    def validate_interests(cls, v: list[str]) -> list[str]:
        if not 1 <= len(v) <= 10:
            raise ValueError("interests must have 1-10 items")
        return v

    @model_validator(mode="after")
    def validate_sections(self) -> "PostCreate":
        # No format allows two sections of the same type: consumers read the
        # first match (quiz answering, search), so questions in a duplicate
        # section would render but never be answerable.
        types = [s.type for s in self.sections]
        duplicates = sorted({t for t in types if types.count(t) > 1})
        if duplicates:
            raise ValueError(f"duplicate section type(s): {', '.join(duplicates)}")
        if self.format != "books":
            return self
        # Validate feed card shape for books
        BooksFeedCard(**self.feed_card)
        # Check all required section types are present
        present = {s.type for s in self.sections}
        missing = BOOKS_REQUIRED_SECTIONS - present
        if missing:
            missing_list = ", ".join(sorted(missing))
            raise ValueError(f"section(s) required for Books format: {missing_list}")
        # Validate image_url in sections: user content must use /uploads/ prefix
        for section in self.sections:
            section_dict = section.model_dump()
            _check_image_urls(section_dict)
        return self


def _check_image_urls(data: dict) -> None:
    """Recursively verify any image_url in user-submitted content uses the Supabase storage URL."""
    supabase_url = os.environ.get("SUPABASE_URL", "")
    storage_prefix = f"{supabase_url}/storage/v1/object/public/uploads/"
    for key, value in data.items():
        if key == "image_url" and isinstance(value, str) and value:
            if not value.startswith(storage_prefix):
                raise ValueError(
                    "image_url must reference our upload endpoint"
                )
        elif isinstance(value, dict):
            _check_image_urls(value)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    _check_image_urls(item)


class ReadNextItem(BaseModel):
    # One resolved "read next" edge for the post-detail page (see
    # graph_edges.resolved_read_next). target_post_id is the live target's id, or
    # None when the edge is latent (target does not exist / is not published yet).
    target_post_id: int | None = None
    format: str
    title: str
    latent: bool


class PostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    format: str
    title: str
    feed_card: dict
    sections: list[dict]
    tags: List[str] = []
    # Server-resolved featured edges for the detail page: the resolved
    # projection so the frontend resolves nothing. The raw authoring-layer
    # connections array stays on the ORM row (seed pipeline input) but is not
    # serialized -- no client reads it. Empty on list endpoints (only
    # GET /posts/{id} populates it).
    read_next: List[ReadNextItem] = []
    author_id: int | None = None
    author_username: str | None = None
    author_is_verified: int | None = None
    author_avatar_url: str | None = None
    status: str = "published"
    created_at: datetime | None = None
    is_user_content: bool = False
    like_count: int = 0
    comment_count: int = 0
    # Computed from the post's text on write and stored on the row
    # (models.Post.reading_minutes), so it survives PostListOut.drop_sections
    # and list endpoints never walk the sections JSON.
    reading_minutes: int = 1
    interests: List[str] = []
    # Display name of the primary category (tags[0]), attached by attach_counts
    # from the post's own interests so the card eyebrow and the interest chips
    # label the same slug identically. None when tags[0] is absent/unmapped.
    primary_category_name: str | None = None

    @field_validator("interests", mode="before")
    @classmethod
    def extract_interest_names(cls, v):
        if v and hasattr(v[0], "name"):
            return [interest.name for interest in v]
        return v

    @field_validator("sections", mode="before")
    @classmethod
    def strip_quiz_answers(cls, v):
        # Quiz correctness is validated server-side (POST /api/quiz/answer);
        # answer_index and explanation must never be delivered with the post.
        # Works on copies — mutating in place would write back to the ORM JSON.
        if not isinstance(v, list):
            return v
        out = []
        for section in v:
            if isinstance(section, dict) and section.get("type") == "quiz":
                items = section.get("content") or []
                stripped = [
                    {k: val for k, val in item.items() if k not in ("answer_index", "explanation")}
                    if isinstance(item, dict) else item
                    for item in items
                ]
                section = {**section, "content": stripped}
            out.append(section)
        return out


class PostListOut(PostOut):
    # List-endpoint serialization: the sections key stays in the response
    # (schema unchanged for clients) but the body is dropped — no list view
    # renders sections, and the detail page always refetches GET /api/posts/{id}.
    # Distinct validator name so it composes with strip_quiz_answers in any
    # order ([] is a fixed point for both).

    @field_validator("sections", mode="before")
    @classmethod
    def drop_sections(cls, v):
        return []


class UploadResponse(BaseModel):
    url: str


class SvgUploadResponse(BaseModel):
    svg_content: str
