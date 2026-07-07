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

# JWT_SECRET must be set in .env before starting the server — see .env.example
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is not set. See backend/.env.example.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

_bearer = HTTPBearer()
_optional_bearer = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    return _bcrypt_lib.hashpw(plain.encode("utf-8")[:72], _bcrypt_lib.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt_lib.checkpw(plain.encode("utf-8")[:72], hashed.encode("utf-8"))


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> int:
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
        return int(user_id_str)
    except (JWTError, ValueError):
        raise credentials_error


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    user_id = decode_access_token(credentials.credentials)
    # Deliberately one users lookup per authenticated request (not cached): it is
    # what keeps is_active revocation immediate -- a soft-deleted user is locked
    # out on their very next request. A short-TTL id->User cache would trade that
    # for bounded latency; not worth the revocation delay at current scale.
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    try:
        user_id = decode_access_token(credentials.credentials)
        return db.query(User).filter(User.id == user_id, User.is_active == True).first()
    except HTTPException:
        return None


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
    user_id = decode_access_token(credentials.credentials)  # raises 401 on a bad token
    return db.query(User).filter(User.id == user_id, User.is_active == True).first()


def get_optional_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer),
) -> Optional[int]:
    """The caller's user id straight from the bearer token, WITHOUT the DB
    lookup get_optional_user pays. For endpoints that only need an identity
    (the feed's session seed and rate-limit key), never the user row; it does
    not check is_active, so it must never gate data access."""
    if not credentials:
        return None
    try:
        return decode_access_token(credentials.credentials)
    except HTTPException:
        return None
