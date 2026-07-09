import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt as _bcrypt_lib
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .database import get_db
from .models import User

load_dotenv()

# JWT_SECRET must be set in .env before starting the server — see .env.example.
# HS256 makes the secret the ONLY barrier to forging a token for any user id, so
# reject a missing, placeholder, or weak (short) secret at startup rather than
# accepting one that can be guessed or brute-forced (M118/SEC-003).
JWT_SECRET = os.getenv("JWT_SECRET")
_PLACEHOLDER_SECRET = "your-secret-key-here"  # the .env.example default
_MIN_SECRET_LENGTH = 32
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is not set. See backend/.env.example.")
if JWT_SECRET == _PLACEHOLDER_SECRET:
    raise RuntimeError(
        "JWT_SECRET is still the example placeholder. Generate a real one: "
        'python -c "import secrets; print(secrets.token_hex(32))"'
    )
if len(JWT_SECRET) < _MIN_SECRET_LENGTH:
    raise RuntimeError(
        f"JWT_SECRET is too short ({len(JWT_SECRET)} chars); use at least "
        f"{_MIN_SECRET_LENGTH}. Generate one: "
        'python -c "import secrets; print(secrets.token_hex(32))"'
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

_bearer = HTTPBearer()
_optional_bearer = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    return _bcrypt_lib.hashpw(plain.encode("utf-8")[:72], _bcrypt_lib.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    # A malformed stored hash (legacy or hand-inserted row) raises ValueError
    # inside checkpw; that must be "wrong password", not a 500 on the login
    # path (BUG-075/M151).
    try:
        return _bcrypt_lib.checkpw(plain.encode("utf-8")[:72], hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: int, token_version: int = 0) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(user_id), "exp": expire, "ver": token_version}
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> tuple[int, int]:
    """Return (user_id, token_version). A token minted before the ver claim
    existed reports version 0, which matches the default column, so old tokens
    stay valid; the version is compared to the user row by the dependencies
    below (M126)."""
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise credentials_error
        try:
            token_version = int(payload.get("ver", 0))
        except (TypeError, ValueError):
            token_version = 0
        return int(user_id_str), token_version
    except (JWTError, ValueError):
        raise credentials_error


def _token_version_matches(user: Optional[User], token_version: int) -> bool:
    """A loaded user is authenticated only if the token's ver matches the row's
    current token_version (M126): a bumped version (password change) invalidates
    every older token."""
    return user is not None and user.token_version == token_version


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    user_id, token_version = decode_access_token(credentials.credentials)
    # Deliberately one users lookup per authenticated request (not cached): it is
    # what keeps is_active revocation immediate -- a soft-deleted user is locked
    # out on their very next request. A short-TTL id->User cache would trade that
    # for bounded latency; not worth the revocation delay at current scale.
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not _token_version_matches(user, token_version):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    try:
        user_id, token_version = decode_access_token(credentials.credentials)
    except HTTPException:
        return None
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    return user if _token_version_matches(user, token_version) else None


def get_optional_user_strict(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Like get_optional_user, but a PRESENT-but-invalid/expired token is a hard
    401 (bad credentials) instead of silently anonymous. Absent credentials still
    mean a legitimate anonymous caller. Use on optional-auth WRITE endpoints so a
    stale-token client is told to re-authenticate rather than having its write
    recorded against no one (or, for the quiz, returned unscored)."""
    if not credentials:
        return None
    user_id, token_version = decode_access_token(credentials.credentials)  # raises 401 on a bad token
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not _token_version_matches(user, token_version):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_optional_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer),
) -> Optional[int]:
    """The caller's user id straight from the bearer token, WITHOUT the DB
    lookup get_optional_user pays. For endpoints that only need an identity
    (a rate-limit key), never the user row; it does not check is_active or the
    token version, so it must never gate data access."""
    if not credentials:
        return None
    try:
        user_id, _token_version = decode_access_token(credentials.credentials)
        return user_id
    except HTTPException:
        return None
