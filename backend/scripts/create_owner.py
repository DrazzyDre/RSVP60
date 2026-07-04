"""Bootstrap (or promote) an owner account.

The very first owner cannot be created from inside the app — admin-account
management is owner-only — so it is created directly at the database level.
This is the local/dev counterpart of the production "create the first owner"
step in DEPLOYMENT.md §7.

It changes exactly one ``admins`` row and never touches event / RSVP data.

Usage (from the backend/ directory, venv active):

    # Promote an account you already have — fastest, keeps its current password:
    python -m scripts.create_owner admin@rsvp60.com --promote

    # Create a brand-new owner (prompts for a hidden password):
    python -m scripts.create_owner owner@rsvp60.com --name "Your Name"

    # Non-interactive password (visible in shell history — dev only):
    python -m scripts.create_owner owner@rsvp60.com --password "s3cret-pass"

Whatever DATABASE_URL is in your environment / backend/.env is the database it
writes to, so double-check you are not pointed at production.
"""

import argparse
import getpass
import sys

from app.database import SessionLocal
from app.models import Admin
from app.security import hash_password

MIN_PASSWORD_LEN = 8


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or promote an owner account.")
    parser.add_argument("email", help="Email address of the owner account.")
    parser.add_argument("--name", default="", help="Full name (for a new account).")
    parser.add_argument(
        "--promote",
        action="store_true",
        help="If the account exists, only elevate it to owner (keep its password).",
    )
    parser.add_argument(
        "--password",
        default=None,
        help="Set/replace the password non-interactively (dev only).",
    )
    args = parser.parse_args()

    email = args.email.strip().lower()
    db = SessionLocal()
    try:
        existing = db.query(Admin).filter(Admin.email == email).one_or_none()

        if existing and args.promote and not args.password:
            existing.role = "owner"
            existing.is_active = True
            db.commit()
            print(f"Promoted existing account '{email}' to owner (password unchanged).")
            return 0

        # Otherwise we need a password (to create, or to reset on --password).
        password = args.password
        if password is None:
            password = getpass.getpass("New password (min 8 chars): ")
            confirm = getpass.getpass("Confirm password: ")
            if password != confirm:
                print("Passwords do not match. Aborted.", file=sys.stderr)
                return 1
        if len(password) < MIN_PASSWORD_LEN:
            print(
                f"Password must be at least {MIN_PASSWORD_LEN} characters. Aborted.",
                file=sys.stderr,
            )
            return 1

        if existing:
            existing.role = "owner"
            existing.is_active = True
            existing.hashed_password = hash_password(password)
            db.commit()
            print(f"Updated '{email}' -> owner and reset its password.")
        else:
            db.add(
                Admin(
                    email=email,
                    full_name=args.name,
                    role="owner",
                    hashed_password=hash_password(password),
                )
            )
            db.commit()
            print(f"Created owner account '{email}'.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
