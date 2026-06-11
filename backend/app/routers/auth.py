import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.orm import Session

from ..auth import create_access_token, get_current_user, hash_password, verify_password
from ..database import get_db
from ..models import User
from ..rate_limit import check_rate_limit
from ..sanitize import validate_image
from ..schemas import UserOut
from ..upload_config import SUPABASE_BUCKET, supabase_client

router = APIRouter(prefix="/auth", tags=["auth"])

# Forward-only: applies to new registrations and username changes. Existing
# accounts with other formats keep working (no retroactive enforcement).
USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,30}$")
USERNAME_RULE = "Username must be 3-30 characters: letters, numbers, dots, dashes or underscores."


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not USERNAME_RE.fullmatch(v):
            raise ValueError(USERNAME_RULE)
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        # bcrypt silently truncates at 72 bytes — reject rather than accept a weaker secret
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 bytes or fewer (bcrypt limit).")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(f"ip:{_client_ip(request)}", "register", 10, 3600)
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered.")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken.")

    user = User(
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    # Slow down credential stuffing: per-IP and per-target-email limits.
    check_rate_limit(f"ip:{_client_ip(request)}", "login", 30, 300)
    check_rate_limit(f"email:{body.email.lower()}", "login", 10, 300)
    user = db.query(User).filter(User.email == body.email, User.is_active == True).first()
    # use the same error whether the email is unknown or the password is wrong
    # to avoid leaking which field was incorrect
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


class PatchMeRequest(BaseModel):
    username: str | None = None
    new_password: str | None = None
    current_password: str | None = None
    is_private: Optional[bool] = None
    bio: Optional[str] = None

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 bytes or fewer (bcrypt limit).")
        return v

    @field_validator("bio")
    @classmethod
    def validate_bio(cls, v: str | None) -> str | None:
        if v is not None and len(v) > 160:
            raise ValueError("bio must be 160 characters or fewer.")
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not USERNAME_RE.fullmatch(v):
            raise ValueError(USERNAME_RULE)
        return v


@router.patch("/me", response_model=UserOut)
def patch_me(
    body: PatchMeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if all(v is None for v in [body.username, body.new_password, body.is_private, body.bio]):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one field to update.",
        )

    if body.new_password is not None:
        if not body.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="current_password is required when changing password.",
            )
        if not verify_password(body.current_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect.",
            )
        current_user.password_hash = hash_password(body.new_password)

    if body.username is not None:
        conflict = (
            db.query(User)
            .filter(User.username == body.username, User.id != current_user.id)
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken.",
            )
        current_user.username = body.username

    if body.is_private is not None:
        current_user.is_private = body.is_private

    if body.bio is not None:
        current_user.bio = body.bio

    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Same hardened pipeline as post images: magic-byte check + Pillow re-encode.
    check_rate_limit(current_user.id, "avatar_upload", 10, 3600)
    try:
        data, media_type = await validate_image(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    ext = media_type.split("/")[1]
    if ext == "jpeg":
        ext = "jpg"
    filename = f"{uuid.uuid4()}.{ext}"
    path = f"images/{filename}"
    supabase_client.storage.from_(SUPABASE_BUCKET).upload(
        path=path,
        file=data,
        file_options={"content-type": media_type, "upsert": "false"},
    )
    url = supabase_client.storage.from_(SUPABASE_BUCKET).get_public_url(path)

    current_user.avatar_url = url
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)


class DeleteMeRequest(BaseModel):
    current_password: str


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    body: DeleteMeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    # Soft delete: a hard DELETE would orphan comments/posts/events/follows
    # (SQLite does not enforce the FKs here) and crash endpoints that join on
    # the user. All auth and lookup paths already filter on is_active.
    current_user.is_active = False
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
