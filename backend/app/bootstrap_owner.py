"""Guarded first-owner bootstrap.

Create the very first ``owner`` account safely — without demo seed data, table
drops, or manual SQL. This is the production-safe replacement for the manual
insert described in DEPLOYMENT.md §7.

Run it as a module::

    python -m app.bootstrap_owner

Owner details are resolved in priority order: CLI flags, then environment
variables, then interactive prompts. The password is read with ``getpass`` (not
echoed) and is **never printed or logged**.

Environment variables (optional, for non-interactive/automated use):
    BOOTSTRAP_OWNER_EMAIL, BOOTSTRAP_OWNER_NAME, BOOTSTRAP_OWNER_PASSWORD

Safety guarantees:
  * creates an owner ONLY when no owner currently exists;
  * refuses (non-zero exit) if any owner already exists — it never overwrites;
  * refuses if the email already belongs to another account;
  * enforces the standard admin password policy (``validate_password_strength``);
  * hashes with the app's auth system (``hash_password``);
  * works against PostgreSQL and SQLite (plain SQLAlchemy);
  * requires the schema to already exist (Alembic) — it never drops or creates
    tables and never runs seed data;
  * writes an audit record (``action="owner_bootstrapped"``) with no secrets.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Admin, AuditLog
from .roles import OWNER
from .security import hash_password, validate_password_strength


class BootstrapError(RuntimeError):
    """Raised for a safe refusal (owner exists, email taken, bad input).

    Its message never contains password material.
    """


def owner_exists(db: Session) -> bool:
    """True if any account already holds the owner role."""
    return (
        db.execute(select(Admin.id).where(Admin.role == OWNER).limit(1)).first()
        is not None
    )


def normalize_email(email: str) -> str:
    """Match how the app stores/looks up emails (lower-cased, trimmed)."""
    return (email or "").strip().lower()


def bootstrap_owner(
    db: Session, email: str, full_name: str, password: str
) -> Admin:
    """Create the first owner. Raises on any unsafe condition.

    * ``BootstrapError`` — an owner already exists, the email is taken, or the
      email is missing/malformed.
    * ``ValueError`` — the password fails the policy (surfaced verbatim).
    """
    if owner_exists(db):
        raise BootstrapError(
            "An owner account already exists — refusing to create another. "
            "Use the app's Admins page to manage accounts."
        )

    email_norm = normalize_email(email)
    if not email_norm or "@" not in email_norm:
        raise BootstrapError("A valid owner email is required.")

    taken = db.execute(
        select(Admin.id).where(Admin.email == email_norm).limit(1)
    ).first()
    if taken is not None:
        raise BootstrapError(
            "An account with that email already exists — refusing to overwrite it."
        )

    # Enforce the same password policy as the API (raises ValueError on failure).
    validate_password_strength(password)

    admin = Admin(
        email=email_norm,
        full_name=(full_name or "").strip(),
        role=OWNER,
        hashed_password=hash_password(password),
        is_active=True,
    )
    db.add(admin)
    db.flush()
    # Best-effort audit trail — records the fact, never the password.
    db.add(
        AuditLog(
            admin_id=None,
            action="owner_bootstrapped",
            entity_type="admin",
            entity_id=admin.id,
            meta=json.dumps({"email": email_norm}),
        )
    )
    db.commit()
    db.refresh(admin)
    return admin


def _resolve(cli_value: str | None, env_name: str) -> str | None:
    if cli_value:
        return cli_value
    return os.getenv(env_name)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.bootstrap_owner",
        description="Create the first owner account (safe, no seed/reset).",
    )
    parser.add_argument("--email", help="Owner email (or BOOTSTRAP_OWNER_EMAIL).")
    parser.add_argument("--name", help="Owner full name (or BOOTSTRAP_OWNER_NAME).")
    parser.add_argument(
        "--password",
        help="Owner password (or BOOTSTRAP_OWNER_PASSWORD). Prefer the prompt — "
        "a value passed here is visible in shell history.",
    )
    args = parser.parse_args(argv)

    email = _resolve(args.email, "BOOTSTRAP_OWNER_EMAIL")
    if not email:
        email = input("Owner email: ").strip()
    full_name = _resolve(args.name, "BOOTSTRAP_OWNER_NAME") or ""

    password = _resolve(args.password, "BOOTSTRAP_OWNER_PASSWORD")
    if not password:
        password = getpass.getpass("Owner password (min 8 chars, hidden): ")
        if password != getpass.getpass("Confirm password: "):
            print("Passwords do not match. No changes made.", file=sys.stderr)
            return 1

    # Import here so the module is importable (for tests) without opening the
    # real database engine at import time.
    from .database import SessionLocal

    db = SessionLocal()
    try:
        admin = bootstrap_owner(db, email, full_name, password)
    except (BootstrapError, ValueError) as exc:
        # Neither exception type carries password material.
        print(f"Refused: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()

    # Never echo the password.
    print(f"Owner account created: {admin.email}")
    if args.password or os.getenv("BOOTSTRAP_OWNER_PASSWORD"):
        print("Tip: the password was supplied non-interactively — rotate it after "
              "first login and clear it from your shell history/CI logs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
