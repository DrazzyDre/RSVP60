"""Shared FastAPI dependencies (auth + role checks + audit helpers)."""

import json
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import Admin, AuditLog
from .roles import ADMIN_MANAGER_ROLES, EDITOR_ROLES
from .security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Admin:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session. Please log in again.",
        )

    admin = db.get(Admin, payload.get("sub"))
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin account no longer exists.",
        )
    # Deactivated accounts cannot use existing tokens.
    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This admin account has been deactivated.",
        )
    return admin


def require_roles(*allowed: str) -> Callable[..., Admin]:
    """Dependency factory: require the current admin to hold one of ``allowed``.

    All permissions are enforced here on the backend; frontend guards are only
    a convenience.
    """

    def _dependency(admin: Admin = Depends(get_current_admin)) -> Admin:
        if admin.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to perform this action.",
            )
        return admin

    return _dependency


# Editors (owner/admin) may mutate events, invite trees, RSVPs and flyers.
require_editor = require_roles(*EDITOR_ROLES)
# Only owners may manage other admin accounts.
require_owner = require_roles(*ADMIN_MANAGER_ROLES)


def log_action(
    db: Session,
    admin: Admin | None,
    action: str,
    entity_type: str,
    entity_id: str,
    metadata: dict | None = None,
) -> None:
    """Best-effort audit trail. Committed by the caller."""
    db.add(
        AuditLog(
            admin_id=admin.id if admin else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            meta=json.dumps(metadata or {}),
        )
    )
