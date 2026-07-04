"""Unit tests for the guarded first-owner bootstrap (app.bootstrap_owner).

Uses an isolated in-memory SQLite database — no live services, no seed data.

    python -m unittest tests.test_bootstrap_owner -v
"""

import io
import unittest
from contextlib import redirect_stdout, redirect_stderr

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.bootstrap_owner import BootstrapError, bootstrap_owner, owner_exists
from app.database import Base
from app.models import Admin, Event, InviteTree, Rsvp
from app.roles import OWNER
from app.security import verify_password

PLAINTEXT = "Str0ng-Pilot-Pass!"


class BootstrapOwnerTests(unittest.TestCase):
    def setUp(self):
        # A fresh, isolated in-memory schema for every test.
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def _owners(self):
        return self.db.execute(select(Admin).where(Admin.role == OWNER)).scalars().all()

    def test_creates_first_owner(self):
        admin = bootstrap_owner(self.db, "owner@pilot.example.com", "Pilot Owner", PLAINTEXT)
        self.assertEqual(admin.role, OWNER)
        self.assertTrue(admin.is_active)
        self.assertTrue(verify_password(PLAINTEXT, admin.hashed_password))
        self.assertEqual(len(self._owners()), 1)

    def test_writes_audit_record(self):
        bootstrap_owner(self.db, "owner@pilot.example.com", "Pilot Owner", PLAINTEXT)
        from app.models import AuditLog

        rows = self.db.execute(
            select(AuditLog).where(AuditLog.action == "owner_bootstrapped")
        ).scalars().all()
        self.assertEqual(len(rows), 1)
        # The audit meta records the fact, never password material.
        self.assertNotIn(PLAINTEXT, rows[0].meta)

    def test_refuses_when_owner_exists(self):
        bootstrap_owner(self.db, "owner@pilot.example.com", "First", PLAINTEXT)
        self.assertTrue(owner_exists(self.db))
        with self.assertRaises(BootstrapError):
            bootstrap_owner(self.db, "second@pilot.example.com", "Second", PLAINTEXT)
        # No second owner, and the second email was never created.
        self.assertEqual(len(self._owners()), 1)
        self.assertIsNone(
            self.db.execute(
                select(Admin).where(Admin.email == "second@pilot.example.com")
            ).scalar_one_or_none()
        )

    def test_refuses_when_email_taken_by_non_owner(self):
        # A non-owner admin exists (no owner yet); bootstrapping that email refuses.
        self.db.add(
            Admin(email="taken@pilot.example.com", full_name="Admin",
                  role="admin", hashed_password="x")
        )
        self.db.commit()
        with self.assertRaises(BootstrapError):
            bootstrap_owner(self.db, "Taken@Pilot.Example.com", "Owner", PLAINTEXT)
        self.assertEqual(len(self._owners()), 0)

    def test_rejects_weak_passwords(self):
        for weak in ["owner123", "short", "password", "       "]:
            with self.subTest(weak=weak):
                with self.assertRaises(ValueError):
                    bootstrap_owner(self.db, "owner@pilot.example.com", "Owner", weak)
        # Nothing was created by any failed attempt.
        self.assertEqual(self.db.execute(select(Admin)).scalars().all(), [])

    def test_normalizes_email(self):
        admin = bootstrap_owner(self.db, "  Owner@Example.COM ", "Owner", PLAINTEXT)
        self.assertEqual(admin.email, "owner@example.com")

    def test_missing_email_refused(self):
        with self.assertRaises(BootstrapError):
            bootstrap_owner(self.db, "   ", "Owner", PLAINTEXT)
        with self.assertRaises(BootstrapError):
            bootstrap_owner(self.db, "not-an-email", "Owner", PLAINTEXT)

    def test_does_not_reveal_password_material(self):
        # Capture any output the core call might make; assert the plaintext never
        # appears in stdout/stderr, the returned object, or the stored hash.
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            admin = bootstrap_owner(self.db, "owner@pilot.example.com", "Owner", PLAINTEXT)
        self.assertNotIn(PLAINTEXT, out.getvalue())
        self.assertNotIn(PLAINTEXT, err.getvalue())
        self.assertNotEqual(admin.hashed_password, PLAINTEXT)
        self.assertNotIn(PLAINTEXT, repr(admin.__dict__))

    def test_does_not_affect_other_records(self):
        # Seed a minimal event/tree/rsvp graph, then bootstrap, then assert intact.
        ev = Event(name="Pilot Celebration")
        self.db.add(ev)
        self.db.flush()
        tree = InviteTree(event_id=ev.id, name="Family", allocated_seats=10, token="tok-pilot-1")
        self.db.add(tree)
        self.db.flush()
        rsvp = Rsvp(
            event_id=ev.id, invite_tree_id=tree.id, full_name="Guest One",
            phone="+10000000001", rsvp_status="accepted", seats_requested=2,
            check_in_token="ci-pilot-1",
        )
        self.db.add(rsvp)
        self.db.commit()

        bootstrap_owner(self.db, "owner@pilot.example.com", "Owner", PLAINTEXT)

        self.assertEqual(len(self.db.execute(select(Event)).scalars().all()), 1)
        self.assertEqual(len(self.db.execute(select(Rsvp)).scalars().all()), 1)
        kept = self.db.execute(select(Rsvp)).scalar_one()
        self.assertEqual(kept.rsvp_status, "accepted")
        self.assertEqual(kept.seats_requested, 2)


if __name__ == "__main__":
    unittest.main()
