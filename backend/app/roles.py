"""Admin roles and role-based permissions.

Three flat roles (deliberately simple — no fine-grained permission matrix):

* ``owner``  — full control, including creating/editing/deactivating other
  admins and changing their roles.
* ``admin``  — manage events, invite trees, RSVPs and exports; may NOT manage
  other admins.
* ``viewer`` — read-only: dashboard, invite trees, RSVPs and exports.

The backend is the source of truth for these rules; the frontend only mirrors
them to show/hide UI.
"""

OWNER = "owner"
ADMIN = "admin"
VIEWER = "viewer"

ROLES: tuple[str, ...] = (OWNER, ADMIN, VIEWER)

# Roles permitted to mutate events / invite trees / RSVPs / flyers.
EDITOR_ROLES: tuple[str, ...] = (OWNER, ADMIN)

# Roles permitted to manage other admins.
ADMIN_MANAGER_ROLES: tuple[str, ...] = (OWNER,)


def normalize_role(role: str | None) -> str:
    """Coerce an unknown/blank role to the least-privileged role (viewer)."""
    return role if role in ROLES else VIEWER
