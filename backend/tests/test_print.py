import base64
import os
import tempfile
import time
import unittest

from app.database import Database
from app.print_jobs import PrintService
from app.service import DomainError


class PrintTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["KART_SESSION_SECRET"] = "print-test-secret-at-least-32-characters"
        os.environ["KART_UPLOAD_DIR"] = self.tmp.name + "/uploads"
        self.s = PrintService(Database(self.tmp.name + "/kart.db"))
        with self.s.database.transaction() as db:
            db.executemany("INSERT INTO campuses VALUES (?,?)", [("c1", "One"), ("c2", "Two")])
            db.executemany("INSERT INTO users VALUES (?,?,?,?,?)", [
                ("buyer", "c1", "Buyer", "student", 1),
                ("shop", "c1", "Shop", "student", 1),
                ("stranger", "c1", "Stranger", "student", 1),
                ("foreign", "c2", "Foreign", "student", 1),
            ])
        self.s.demo_grant("buyer", 200, "print-grant-unique")
        self.store = self.s.create_organization("shop", "Xerox", "vendor", "xerox")["store_id"]
        self.payload = {"file_name": "report.pdf", "pdf_base64": base64.b64encode(b"%PDF-1.4\nexample\n%%EOF").decode(),
                        "pages": 10, "copies": 2, "color": False, "duplex": True, "spiral": True}

    def tearDown(self):
        self.tmp.cleanup()

    def test_private_queue_price_and_handover(self):
        job = self.s.submit_print_job("buyer", self.store, self.payload)
        self.assertEqual(job["amount"], 50)
        self.assertEqual(self.s.wallet("buyer")["available"], 150)
        buyer_view = self.s.print_jobs("buyer")[0]
        self.assertNotIn("file_path", buyer_view)
        self.assertEqual(self.s.print_file("shop", job["id"]).read_bytes()[:5], b"%PDF-")
        with self.assertRaises(DomainError):
            self.s.print_file("stranger", job["id"])
        with self.assertRaises(DomainError):
            self.s.print_file("foreign", job["id"])
        self.s.advance_print("shop", job["id"])
        self.s.advance_print("shop", job["id"])
        with self.assertRaises(DomainError):
            self.s.advance_print("shop", job["id"], "bad")
        self.s.advance_print("shop", job["id"], job["pickup_code"])
        self.assertEqual(self.s.print_jobs("buyer")[0]["status"], "collected")

    def test_refund_and_invalid_pdf(self):
        with self.assertRaises(DomainError):
            self.s.submit_print_job("buyer", self.store, {**self.payload, "pdf_base64": base64.b64encode(b"not a pdf").decode()})
        job = self.s.submit_print_job("buyer", self.store, self.payload)
        self.s.cancel_print("buyer", job["id"])
        self.assertEqual(self.s.wallet("buyer")["available"], 200)
        with self.assertRaises(DomainError):
            self.s.cancel_print("buyer", job["id"])

    def test_print_pickup_task_uses_restricted_credential(self):
        with self.s.database.transaction() as db:
            db.execute("INSERT INTO users VALUES (?,?,?,?,?)", ("worker", "c1", "Worker", "student", 1))
        job = self.s.submit_print_job("buyer", self.store, self.payload)
        task_id = self.s.create_task("buyer", {
            "title": "Collect my print", "description": "Bring the report to library", "category": "pickup",
            "anonymous": True, "urgency": "urgent", "pricing": "fixed", "budget": 15,
            "deadline": int(time.time()) + 3600, "print_job_id": job["id"],
        })["id"]
        bid = self.s.bid("worker", task_id, {"amount": 15, "eta_minutes": 10, "note": "Can collect"})["id"]
        self.s.accept("buyer", task_id, bid)
        with self.assertRaises(DomainError):
            self.s.pickup_credential("worker", task_id)
        with self.assertRaises(DomainError):
            self.s.cancel_print("buyer", job["id"])
        self.s.advance_print("shop", job["id"])
        self.s.advance_print("shop", job["id"])
        self.assertEqual(self.s.pickup_credential("worker", task_id)["pickup_code"], job["pickup_code"])
        self.s.transition("worker", task_id, "start")
        self.s.advance_print("shop", job["id"], job["pickup_code"])
        self.s.transition("worker", task_id, "submit")
        self.s.transition("buyer", task_id, "approve")


if __name__ == "__main__":
    unittest.main()
