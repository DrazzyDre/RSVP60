"""Unit tests for RSVP availability + reason evaluation.

Timezone-safety and the per-reason breakdown are the whole point of this module,
so the tests pin down the exact reason code for every closure and prove the
deadline comparison never depends on the server's local timezone.

    python -m unittest tests.test_availability -v
"""

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app import availability
from app.availability import (
    ACCEPTING,
    DEADLINE_PASSED,
    EVENT_ARCHIVED,
    EVENT_CLOSED,
    EVENT_DRAFT,
    TREE_PAUSED,
    deadline_cutoff,
    evaluate,
)

UTC = timezone.utc


def _event(status="active", deadline=None, auto_close=True):
    return SimpleNamespace(
        status=status, rsvp_deadline=deadline, auto_close_rsvp=auto_close
    )


def _tree(status="active"):
    return SimpleNamespace(status=status)


class ReasonTests(unittest.TestCase):
    def test_active_event_active_tree_future_deadline_accepts(self):
        now = datetime(2026, 7, 5, 12, 0, tzinfo=UTC)
        ev = _event(deadline=datetime(2026, 7, 10, 17, 0), auto_close=True)
        result = evaluate(ev, _tree(), now=now)
        self.assertTrue(result.accepting)
        self.assertEqual(result.reason, ACCEPTING)
        self.assertEqual(result.label, "Accepting RSVPs")

    def test_auto_close_disabled_accepts_past_deadline(self):
        now = datetime(2026, 7, 20, 12, 0, tzinfo=UTC)
        ev = _event(deadline=datetime(2026, 7, 10, 17, 0), auto_close=False)
        result = evaluate(ev, _tree(), now=now)
        self.assertTrue(result.accepting)
        self.assertEqual(result.reason, ACCEPTING)

    def test_past_deadline_with_auto_close_is_deadline_passed(self):
        now = datetime(2026, 7, 20, 12, 0, tzinfo=UTC)
        ev = _event(deadline=datetime(2026, 7, 10, 17, 0), auto_close=True)
        result = evaluate(ev, _tree(), now=now)
        self.assertFalse(result.accepting)
        self.assertEqual(result.reason, DEADLINE_PASSED)

    def test_draft_event_is_closed(self):
        result = evaluate(_event(status="draft"), _tree())
        self.assertFalse(result.accepting)
        self.assertEqual(result.reason, EVENT_DRAFT)

    def test_closed_event_is_closed(self):
        result = evaluate(_event(status="closed"), _tree())
        self.assertFalse(result.accepting)
        self.assertEqual(result.reason, EVENT_CLOSED)

    def test_archived_event_is_closed(self):
        result = evaluate(_event(status="archived"), _tree())
        self.assertFalse(result.accepting)
        self.assertEqual(result.reason, EVENT_ARCHIVED)

    def test_paused_tree_is_unavailable(self):
        result = evaluate(_event(status="active"), _tree(status="paused"))
        self.assertFalse(result.accepting)
        self.assertEqual(result.reason, TREE_PAUSED)

    def test_event_level_reason_wins_over_tree_pause(self):
        # A draft event reports the event reason even if the tree is also paused.
        result = evaluate(_event(status="draft"), _tree(status="paused"))
        self.assertEqual(result.reason, EVENT_DRAFT)

    def test_event_only_check_ignores_tree_pause(self):
        # Event-level check (tree=None) never reports a tree pause.
        result = evaluate(_event(status="active"), None)
        self.assertTrue(result.accepting)


class ExhaustionIsNotClosureTests(unittest.TestCase):
    def test_full_tree_still_accepts(self):
        # Availability never considers seat usage — a full tree still "accepts"
        # here so seat_logic can waitlist the guest rather than closing the page.
        result = evaluate(_event(status="active"), _tree(status="active"))
        self.assertTrue(result.accepting)
        self.assertEqual(result.reason, ACCEPTING)


class TimezoneSafetyTests(unittest.TestCase):
    def test_naive_deadline_treated_as_utc(self):
        # A naive stored deadline is compared as UTC against a UTC now.
        now = datetime(2026, 7, 10, 16, 59, tzinfo=UTC)
        ev = _event(deadline=datetime(2026, 7, 10, 17, 0), auto_close=True)
        self.assertTrue(evaluate(ev, _tree(), now=now).accepting)
        now_after = datetime(2026, 7, 10, 17, 1, tzinfo=UTC)
        self.assertFalse(evaluate(ev, _tree(), now=now_after).accepting)

    def test_aware_and_naive_compare_without_error(self):
        # An aware (UTC+1) deadline vs a naive now must not raise and must be
        # compared consistently in UTC.
        aware_deadline = datetime(2026, 7, 10, 17, 0, tzinfo=timezone(timedelta(hours=1)))
        ev = _event(deadline=aware_deadline, auto_close=True)
        # 17:00+01:00 == 16:00 UTC. now (naive) 15:30 -> before cutoff -> open.
        before = datetime(2026, 7, 10, 15, 30)
        self.assertTrue(evaluate(ev, _tree(), now=before).accepting)
        after = datetime(2026, 7, 10, 16, 30)
        self.assertFalse(evaluate(ev, _tree(), now=after).accepting)

    def test_utc_now_does_not_close_local_event_prematurely(self):
        # A Nigerian (UTC+1) host sets an 18:00 local deadline; stored as 17:00Z.
        # At 17:30 local (16:30Z) RSVPs must still be open.
        ev = _event(deadline=datetime(2026, 7, 10, 17, 0), auto_close=True)
        now = datetime(2026, 7, 10, 16, 30, tzinfo=UTC)
        self.assertTrue(evaluate(ev, _tree(), now=now).accepting)


class MidnightGraceTests(unittest.TestCase):
    def test_midnight_deadline_gets_end_of_day_grace(self):
        # A date-only (midnight) deadline stays open through the whole day.
        ev = _event(deadline=datetime(2026, 7, 10, 0, 0, 0), auto_close=True)
        midday = datetime(2026, 7, 10, 12, 0, tzinfo=UTC)
        self.assertTrue(evaluate(ev, _tree(), now=midday).accepting)

    def test_midnight_deadline_closes_next_day(self):
        ev = _event(deadline=datetime(2026, 7, 10, 0, 0, 0), auto_close=True)
        next_day = datetime(2026, 7, 11, 0, 30, tzinfo=UTC)
        self.assertFalse(evaluate(ev, _tree(), now=next_day).accepting)

    def test_deadline_cutoff_extends_midnight_only(self):
        # Non-midnight deadlines are used as-is.
        exact = datetime(2026, 7, 10, 17, 0, 0)
        self.assertEqual(deadline_cutoff(exact), exact.replace(tzinfo=UTC))
        # Midnight is pushed to end-of-day.
        midnight = datetime(2026, 7, 10, 0, 0, 0)
        cutoff = deadline_cutoff(midnight)
        self.assertEqual(cutoff.date().isoformat(), "2026-07-10")
        self.assertEqual((cutoff.hour, cutoff.minute, cutoff.second), (23, 59, 59))

    def test_no_deadline_is_open(self):
        self.assertIsNone(deadline_cutoff(None))
        self.assertTrue(evaluate(_event(deadline=None), _tree()).accepting)


class DefaultNowTests(unittest.TestCase):
    def test_default_now_is_used_when_not_supplied(self):
        # No explicit now: a far-future deadline is open; a far-past one is closed.
        future = availability.datetime.now(UTC) + timedelta(days=3650)
        past = availability.datetime.now(UTC) - timedelta(days=3650)
        self.assertTrue(evaluate(_event(deadline=future.replace(tzinfo=None)), _tree()).accepting)
        self.assertFalse(evaluate(_event(deadline=past.replace(tzinfo=None)), _tree()).accepting)


if __name__ == "__main__":
    unittest.main()
