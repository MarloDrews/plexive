import logging
import os
import random
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..account_lifecycle import is_reserved_username, scramble_and_detach
from ..auth import create_access_token, get_current_user, hash_password, verify_password
from ..database import get_db
from ..models import Follow, User
from ..rate_limit import check_rate_limit
from ..sanitize import validate_image
from ..schemas import UserOut
from ..upload_config import SUPABASE_BUCKET, supabase_client

logger = logging.getLogger("app.auth")

router = APIRouter(prefix="/auth", tags=["auth"])

# Forward-only: applies to new registrations and username changes. Existing
# accounts with other formats keep working (no retroactive enforcement).
USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,30}$")
USERNAME_RULE = "Username must be 3-30 characters: letters, numbers, dots, dashes or underscores."

# Cosmetic badge (models.User.badge_id) given to every newly created account,
# randomly one of these ids. Each maps to artwork in frontend lib/accessories.ts;
# purely decorative and never a capability gate.
_SIGNUP_BADGE_IDS = [4, 5, 7, 8]


def _random_signup_badge() -> int:
    return random.choice(_SIGNUP_BADGE_IDS)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


# Google OAuth Web client id. Set GOOGLE_CLIENT_ID in backend/.env to the same
# client id the frontend uses (NEXT_PUBLIC_GOOGLE_CLIENT_ID). When unset, the
# /auth/google endpoint returns 503 so the rest of auth still works without it.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

# One reusable transport for verifying Google ID tokens (fetches and caches
# Google's public signing keys). Cheap to construct, but shared to avoid a new
# HTTP session per sign-in.
_google_transport = google_requests.Request()


# A fixed bcrypt hash to compare against when the login email is unknown, so the
# unknown-email branch still pays the deliberately-slow bcrypt cost and does not
# return markedly faster than a known-email/wrong-password login. Removes the
# timing oracle that distinguished registered emails (M129/SEC-015). Computed
# once at import.
_DUMMY_PASSWORD_HASH = hash_password("timing-oracle-dummy-password-not-a-real-secret")


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
        # The deleted-account lifecycle owns "deleted_user" and "deleted-<id>"
        # (M150): registrable copies would impersonate the placeholder or
        # collide with a future scramble.
        if is_reserved_username(v):
            raise ValueError("This username is reserved.")
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


class PatchMeResponse(UserOut):
    # UserOut plus an optional fresh token: a password change bumps the user's
    # token_version (revoking every other session), so the caller's own token
    # would also be invalidated; return a re-minted one so this session stays
    # signed in (M126). None when the password did not change.
    access_token: str | None = None


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(f"ip:{_client_ip(request)}", "register", 10, 3600)
    # EmailStr lowercases only the domain; normalize the whole address so
    # Bob@x.com and bob@x.com are one account and login is case-insensitive
    # (existing rows are normalized by scripts/lowercase_emails.py).
    email = body.email.lower()
    # SEC-016 (accepted): this returns a definitive "email already registered"
    # signal, a minor account-existence oracle. Removing it would require an
    # email-verification flow (registration would not synchronously confirm the
    # account), which is a feature, not a launch fix. Documented as accepted;
    # revisit with email verification.
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered.")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken.")

    user = User(
        email=email,
        username=body.username,
        password_hash=hash_password(body.password),
        badge_id=_random_signup_badge(),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Concurrent registration passed both pre-checks; the unique
        # constraint caught the second one. Report which field collided, the
        # same 400s as the pre-checks, not a 500 (BE-015/M148).
        db.rollback()
        if db.query(User).filter(User.email == email).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered.")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken.")
    db.refresh(user)

    token = create_access_token(user.id, user.token_version)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    # Slow down credential stuffing: per-IP and per-target-email limits.
    check_rate_limit(f"ip:{_client_ip(request)}", "login", 30, 300)
    check_rate_limit(f"email:{body.email.lower()}", "login", 10, 300)
    user = db.query(User).filter(User.email == body.email.lower(), User.is_active == True).first()
    # Always run a bcrypt comparison (against a fixed dummy hash when the email is
    # unknown) so both branches spend equal time -- no timing oracle for whether
    # an email is registered (M129/SEC-015). Use the same generic error for an
    # unknown email and a wrong password so neither the message nor the latency
    # leaks which field was incorrect.
    password_hash = user.password_hash if user else _DUMMY_PASSWORD_HASH
    password_ok = verify_password(body.password, password_hash)
    if not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(user.id, user.token_version)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


class GoogleAuthRequest(BaseModel):
    # The ID token (a JWT) that Google Identity Services hands the frontend after
    # the user picks their Google account. Google calls this the "credential".
    credential: str


def _slugify_username(base: str) -> str:
    # Keep only characters allowed by USERNAME_RE; drop everything else.
    return re.sub(r"[^A-Za-z0-9._-]", "", base)[:30]


def _generate_unique_username(db: Session, email: str, name: Optional[str]) -> str:
    """Derive a valid, unused username for a new Google account. Google gives us
    an email and a display name, neither of which is guaranteed to fit our
    username rules, so we build a base from the email local part (then the name,
    then a generic stem) and append an incrementing number until it is free."""
    base = _slugify_username(email.split("@")[0]) or _slugify_username(name or "") or "user"
    # Guarantee the 3-character minimum from USERNAME_RE.
    if len(base) < 3:
        base = (base + "user")[:30]
    candidate = base
    suffix = 0
    # Avoid reserved names (deleted-account lifecycle) and existing usernames.
    while is_reserved_username(candidate) or db.query(User).filter(User.username == candidate).first():
        suffix += 1
        tail = str(suffix)
        candidate = f"{base[:30 - len(tail)]}{tail}"
    return candidate


@router.post("/google", response_model=TokenResponse)
def google_auth(body: GoogleAuthRequest, request: Request, db: Session = Depends(get_db)):
    """Sign in (or register) with Google. The frontend sends the Google ID
    token; we verify it against Google's public keys, then find-or-create the
    matching user and issue our own JWT, exactly like /login and /register."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google sign-in is not configured.")
    check_rate_limit(f"ip:{_client_ip(request)}", "google_auth", 30, 300)

    # verify_oauth2_token checks the signature, expiry, issuer and that the token
    # was minted for OUR client id. Any failure raises ValueError -> 401.
    try:
        idinfo = google_id_token.verify_oauth2_token(body.credential, _google_transport, GOOGLE_CLIENT_ID)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not verify Google sign-in.")

    sub = idinfo.get("sub")
    email = (idinfo.get("email") or "").lower()
    # email_verified comes back as a bool or the string "true" depending on flow;
    # accept both. We only link/create on a Google-verified email.
    email_verified = idinfo.get("email_verified") in (True, "true")
    if not sub or not email or not email_verified:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google account has no verified email.")

    # 1) Returning Google user, matched by the stable Google subject id.
    user = db.query(User).filter(User.google_sub == sub, User.is_active == True).first()

    # 2) An existing password account with the same (verified) email: link Google
    #    to it so the user keeps one account and can use either method.
    if user is None:
        user = db.query(User).filter(User.email == email, User.is_active == True).first()
        if user is not None and not user.google_sub:
            user.google_sub = sub
            db.commit()
            db.refresh(user)

    # 3) Brand-new visitor: create an account from the Google profile.
    if user is None:
        username = _generate_unique_username(db, email, idinfo.get("name"))
        user = User(email=email, username=username, password_hash=None, google_sub=sub, badge_id=_random_signup_badge())
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            # Lost a race to a concurrent Google sign-in for the same account;
            # re-fetch the row the other request committed (BE-015 pattern).
            db.rollback()
            user = (
                db.query(User).filter(User.google_sub == sub, User.is_active == True).first()
                or db.query(User).filter(User.email == email, User.is_active == True).first()
            )
            if user is None:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not create account.")
        else:
            db.refresh(user)

    token = create_access_token(user.id, user.token_version)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/google/link", response_model=UserOut)
def google_link(
    body: GoogleAuthRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Connect a Google account to the CURRENTLY logged-in account, regardless of
    whether the Google email matches this account's email. This is how an
    existing email/password user adds Google sign-in: /auth/google can only
    auto-link when the emails are identical, so a user whose Google address
    differs (e.g. a Gmail vs a t-online account) links it here while signed in."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google sign-in is not configured.")
    check_rate_limit(current_user.id, "google_link", 10, 3600)

    try:
        idinfo = google_id_token.verify_oauth2_token(body.credential, _google_transport, GOOGLE_CLIENT_ID)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not verify Google sign-in.")
    sub = idinfo.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not verify Google sign-in.")

    # Already linked to this exact Google account: nothing to do, report success.
    if current_user.google_sub == sub:
        return UserOut.model_validate(current_user)
    # This account already carries a different Google identity.
    if current_user.google_sub:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your account is already connected to a different Google account.",
        )
    # The Google identity already belongs to another account (e.g. a separate
    # account was auto-created by signing in with Google earlier). We do not
    # silently move or delete that account; the user must resolve it first.
    other = db.query(User).filter(User.google_sub == sub, User.id != current_user.id).first()
    if other is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Google account is already connected to another account.",
        )

    current_user.google_sub = sub
    try:
        db.commit()
    except IntegrityError:
        # Lost a race to another link/sign-in claiming the same google_sub.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Google account is already connected to another account.",
        )
    db.refresh(current_user)
    return UserOut.model_validate(current_user)


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
        # Reserved for the deleted-account lifecycle (M150), same as register.
        if is_reserved_username(v):
            raise ValueError("This username is reserved.")
        return v


@router.patch("/me", response_model=PatchMeResponse)
def patch_me(
    body: PatchMeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_rate_limit(current_user.id, "patch_me", 20, 3600)
    if all(v is None for v in [body.username, body.new_password, body.is_private, body.bio]):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one field to update.",
        )

    password_changed = False
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
        # Revoke every existing token by bumping the version (M126).
        current_user.token_version = (current_user.token_version or 0) + 1
        password_changed = True

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
        # Going public releases the request queue (BUG-020/M150): pending
        # rows would otherwise be stuck forever; requesters saw "Requested"
        # while a public account needs no approval.
        if current_user.is_private and body.is_private is False:
            db.query(Follow).filter(
                Follow.following_id == current_user.id,
                Follow.status == "pending",
            ).update({Follow.status: "accepted"}, synchronize_session=False)
        current_user.is_private = body.is_private

    if body.bio is not None:
        current_user.bio = body.bio

    try:
        db.commit()
    except IntegrityError:
        # Concurrent username change to the same value: the unique constraint
        # caught what the pre-check let through (BE-015/M148).
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken.")
    db.refresh(current_user)
    resp = PatchMeResponse.model_validate(current_user)
    if password_changed:
        # Keep THIS session alive with a token carrying the new version; every
        # other outstanding token is now invalid.
        resp.access_token = create_access_token(current_user.id, current_user.token_version)
    return resp


@router.post("/me/avatar", response_model=UserOut)
def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Same hardened pipeline as post images: magic-byte check + Pillow re-encode.
    # Sync def: the image work and storage upload run in the threadpool
    # like every other handler instead of blocking the event loop.
    # Config guard BEFORE the rate limit (BUG-013/M151): a 503 for missing
    # storage must not burn one of the user's 10 hourly slots.
    if supabase_client is None:
        raise HTTPException(status_code=503, detail="Storage not configured")
    check_rate_limit(current_user.id, "avatar_upload", 10, 3600)
    try:
        data, media_type = validate_image(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    ext = media_type.split("/")[1]
    if ext == "jpeg":
        ext = "jpg"
    filename = f"{uuid.uuid4()}.{ext}"
    path = f"images/{filename}"
    # Storage failures surface as a clear upstream error, not an opaque 500
    # (BUG-014/M151).
    try:
        supabase_client.storage.from_(SUPABASE_BUCKET).upload(
            path=path,
            file=data,
            file_options={"content-type": media_type, "upsert": "false"},
        )
        url = supabase_client.storage.from_(SUPABASE_BUCKET).get_public_url(path)
    except Exception:
        logger.exception("avatar upload to storage failed (user %s)", current_user.id)
        raise HTTPException(status_code=502, detail="Storage upload failed. Try again later.")

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
    check_rate_limit(current_user.id, "delete_me", 5, 3600)
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    # Decision 10 (M150): soft delete, but nothing personal may remain. The
    # row is scrambled (email/username freed for re-registration, BUG-021;
    # bio/avatar/password cleared), published posts are re-attributed to the
    # neutral deleted_user sentinel so the content survives without the
    # identity link, and every follow edge is removed so no dead entries
    # linger in lists or request queues (BUG-019/BUG-022). The token_version
    # bump kills every session including live websockets.
    scramble_and_detach(db, current_user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
