"""Password hashing and JWT helpers.

Uses passlib's pure-python pbkdf2_sha256 scheme so there is no native/bcrypt
build step to worry about on Windows or minimal deploy images.
"""

from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from .config import settings

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# Minimum admin password length.
MIN_PASSWORD_LENGTH = 8

# A small blocklist of obviously weak passwords (compared case-insensitively).
# Intentionally minimal — not a full enterprise policy.
_WEAK_PASSWORDS = frozenset(
    {
        "password",
        "password1",
        "password123",
        "admin123",
        "owner123",
        "viewer123",
        "12345678",
        "123456789",
        "1234567890",
        "qwerty123",
        "letmein1",
        "changeme",
        "welcome1",
        "adminadmin",
    }
)


def validate_password_strength(password: str) -> str:
    """Enforce a minimal admin password policy.

    Raises ``ValueError`` (surfaced to clients as a 422) when the password is too
    short, blank/whitespace-only, or an obviously common one.
    """
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters long."
        )
    if not password.strip():
        raise ValueError("Password cannot be blank or only spaces.")
    if password.strip().lower() in _WEAK_PASSWORDS:
        raise ValueError(
            "That password is too common. Please choose a stronger one."
        )
    return password


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, extra: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
