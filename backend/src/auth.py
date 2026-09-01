import os
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-key-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 1 week

# Use PBKDF2-SHA256 for new passwords to avoid bcrypt backend/runtime issues
# and bcrypt's 72-byte password limit. Keep bcrypt in the context so existing
# hashes, if any, still verify.
pwd_context = CryptContext(
    schemes=["pbkdf2_sha256", "bcrypt"],
    deprecated="auto",
)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update(
        {
            "exp": expire,
            "iat": datetime.now(UTC),
            # PostgREST specific claim: 'role' determines the DB role assumed
            "role": data.get("role", "web_user"),
        }
    )

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)  # type: ignore[no-any-return]


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and verify a JWT created by ``create_access_token``.

    Raises ``jwt.PyJWTError`` (expired, invalid signature, malformed) — callers
    that sit on an HTTP boundary should translate that into 401.
    """
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])  # type: ignore[no-any-return]


_bearer_scheme = HTTPBearer(auto_error=False)


async def require_user_id(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> str:
    """FastAPI dependency: Bearer JWT → ``user_id`` claim, or 401.

    Lives here rather than inline in ``main.py`` so the history route (and any
    future gated routes) don't deepen the auth-handlers-in-main drift.
    Missing/invalid credentials are 401, not FastAPI's default HTTPBearer 403.
    """
    if creds is None or creds.scheme.lower() != "bearer" or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(creds.credentials)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return str(user_id)
