import os
import tempfile
import time
import unittest
from unittest.mock import patch

from app.database import Database
from app.ledger import LedgerError, balance, post, reserve, wallet
from app.security import sign, verify
from app.service import DomainError, KartService


class ServiceTests(unittest.TestCase):
    def setUp(self):
        demo = patch.dict(os.environ, {"KART_DEMO_MODE": "1"})
        demo.start()
        self.addCleanup(demo.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.service = KartService(Database(os.path.join(self.tmp.name, "test.db")))
        with self.service.database.transaction() as db:
            db.executemany("INSERT INTO campuses VALUES (?,?)", [("c1", "One"), ("c2", "Two")])
            db.executemany("INSERT INTO users VALUES (?,?,?,?,?)", [
                ("poster", "c1", "Poster", "student", 1),
                ("worker", "c1", "Worker", "student", 1),
                ("other", "c1", "Other", "student", 1),
                ("foreign", "c2", "Foreign", "student", 1),
                ("admin", "c1", "Admin", "campus_admin", 1),
            ])

    def tearDown(self):
        self.tmp.cleanup()

    def task(self, anonymous=True):
        return self.service.create_task("poster", dict(
            title="Collect printing", description="Pick up my approved print job",
            category="errand", anonymous=anonymous, urgency="urgent", pricing="bidding",
            budget=100, deadline=int(time.time()) + 3600,
        ))["id"]

    def bid(self, task_id, user="worker"):
        return self.service.bid(user, task_id, {"amount": 80, "eta_minutes": 30, "note": "Can do"})["id"]

    def test_anonymity_and_campus_isolation(self):
        task_id = self.task()
        public = self.service.task("worker", task_id)
        self.assertNotIn("poster_id", public)
        self.assertIn("poster_alias", public)
        self.assertEqual(self.service.task("poster", task_id)["poster_id"], "poster")
        with self.assertRaises(DomainError) as err:
            self.service.task("foreign", task_id)
        self.assertEqual(err.exception.status, 404)
        self.assertEqual(self.service.list_tasks("foreign"), [])
        with self.assertRaises(DomainError):
            self.bid(task_id, "foreign")

    def test_funding_is_atomic_and_release_once(self):
        task_id = self.task()
        bid_id = self.bid(task_id)
        with self.assertRaises(DomainError):
            self.service.accept("poster", task_id, bid_id)
        self.assertEqual(self.service.task("poster", task_id)["status"], "open")
        self.service.demo_grant("poster", 100, "grant-unique-1")
        self.service.accept("poster", task_id, bid_id)
        with self.assertRaises(DomainError):
            self.service.task("other", task_id)
        self.assertEqual(self.service.wallet("poster"), {"unit": "KC (simulation)", "available": 20, "reserved": 80})
        with self.assertRaises(DomainError):
            self.service.accept("poster", task_id, bid_id)
        self.service.transition("worker", task_id, "start")
        self.service.transition("worker", task_id, "submit")
        self.service.transition("poster", task_id, "approve")
        self.assertEqual(self.service.wallet("worker")["available"], 80)
        with self.assertRaises(DomainError):
            self.service.transition("poster", task_id, "approve")
        with self.service.database.connect() as db:
            self.assertEqual(balance(db, reserve(task_id)), 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM journal WHERE kind='task_release'").fetchone()[0], 1)

    def test_private_bid_threads_and_anonymous_messages(self):
        task_id = self.task()
        bid_id = self.bid(task_id)
        self.bid(task_id, "other")
        self.service.message("poster", task_id, "Hello", bidder_id="worker")
        worker_view = self.service.messages("worker", task_id, bidder_id="worker")
        self.assertEqual(worker_view[0]["sender_id"], "anonymous-poster")
        with self.assertRaises(DomainError):
            self.service.messages("other", task_id, bidder_id="worker")
        with self.assertRaises(DomainError):
            self.service.messages("worker", task_id)
        self.service.demo_grant("poster", 100, "grant-unique-2")
        self.service.accept("poster", task_id, bid_id)
        self.service.message("poster", task_id, "Meet at library")
        self.assertEqual(self.service.messages("worker", task_id)[0]["sender_id"], "anonymous-poster")

    def test_explainable_rank_excludes_unfeasible_eta_from_top(self):
        task_id = self.task()
        self.bid(task_id, "worker")
        self.service.bid("other", task_id, {"amount": 10, "eta_minutes": 10_000, "note": "cheap"})
        result = self.service.bid_recommendations("poster", task_id)
        self.assertEqual(result["confidence"], "low")
        self.assertEqual(result["ranked"][0]["bidder_id"], "worker")
        self.assertFalse(result["ranked"][1]["feasible"])
        with self.assertRaises(DomainError):
            self.service.bid_recommendations("worker", task_id)

    def test_refund_and_dispute_resolution(self):
        task_id = self.task()
        bid_id = self.bid(task_id)
        self.service.demo_grant("poster", 100, "grant-unique-3")
        self.service.accept("poster", task_id, bid_id)
        self.service.transition("poster", task_id, "cancel_assigned")
        self.assertEqual(self.service.wallet("poster")["available"], 100)
        second = self.task()
        b2 = self.bid(second)
        self.service.accept("poster", second, b2)
        self.service.transition("worker", second, "start")
        self.service.transition("worker", second, "submit")
        self.service.transition("worker", second, "dispute")
        with self.assertRaises(DomainError):
            self.service.resolve_dispute("other", second, True)
        self.service.resolve_dispute("admin", second, False)
        self.assertEqual(self.service.wallet("poster")["available"], 100)
        with self.assertRaises(DomainError):
            self.service.resolve_dispute("admin", second, True)

    def test_idempotency_rejects_changed_payload(self):
        with self.service.database.transaction() as db:
            post(db, key="a", kind="demo", ref="poster", debit="demo:issuer", credit=wallet("poster"), amount=20)
            post(db, key="a", kind="demo", ref="poster", debit="demo:issuer", credit=wallet("poster"), amount=20)
            with self.assertRaises(LedgerError):
                post(db, key="a", kind="demo", ref="poster", debit="demo:issuer", credit=wallet("poster"), amount=30)
        self.assertEqual(self.service.wallet("poster")["available"], 20)

    def test_kc_is_closed_outside_demo_mode(self):
        with patch.dict(os.environ, {"KART_DEMO_MODE": "0"}), self.service.database.transaction() as db:
            with self.assertRaisesRegex(LedgerError, "disabled"):
                post(db, key="disabled", kind="demo", ref="poster", debit="demo:issuer",
                     credit=wallet("poster"), amount=20)
        self.assertEqual(self.service.wallet("poster")["available"], 0)

    def test_signed_session_tampering_and_expiry(self):
        token = sign("poster", "x" * 32)
        self.assertEqual(verify(token, "x" * 32), "poster")
        self.assertIsNone(verify(token + "a", "x" * 32))
        self.assertIsNone(verify(sign("poster", "x" * 32, ttl=-1), "x" * 32))

    def test_audit_chain_detects_changed_event(self):
        self.task()
        self.assertTrue(self.service.verify_audit("admin")["valid"])
        with self.assertRaises(DomainError):
            self.service.verify_audit("worker")
        with self.service.database.transaction() as db:
            db.execute("UPDATE audit_events SET action='tampered' WHERE action='task.created'")
        self.assertFalse(self.service.verify_audit("admin")["valid"])


if __name__ == "__main__":
    unittest.main()
