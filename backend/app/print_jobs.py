"""Private PDF print queue with its own fulfillment states."""
import base64
import binascii
import hashlib
import hmac
import os
from pathlib import Path
import time

from .ledger import vendor_payable, wallet
from .market import MarketService, code, digest, payment, uid
from .service import DomainError


class PrintService(MarketService):
    @staticmethod
    def _job(db, actor, job_id):
        job = db.execute("SELECT * FROM print_jobs WHERE id=? AND campus_id=?", (
            job_id, actor["campus_id"])).fetchone()
        if not job:
            raise DomainError("Print job not found", 404)
        return job

    @staticmethod
    def _view(job, buyer=False):
        result = dict(job)
        result.pop("file_path")
        result.pop("pickup_hash")
        if buyer:
            result["pickup_code"] = code(job["id"])
        return result

    def submit_print_job(self, user_id: str, store_id: str, data: dict):
        try:
            raw = base64.b64decode(data["pdf_base64"], validate=True)
        except (ValueError, binascii.Error):
            raise DomainError("Invalid PDF encoding") from None
        if len(raw) < 8 or len(raw) > 5_000_000 or not raw.startswith(b"%PDF-"):
            raise DomainError("Upload a PDF smaller than 5 MB")
        name = Path(data["file_name"]).name
        if name != data["file_name"] or not name.lower().endswith(".pdf"):
            raise DomainError("Invalid PDF filename")
        sheets = (data["pages"] + 1) // 2 if data["duplex"] else data["pages"]
        amount = sheets * data["copies"] * (8 if data["color"] else 2) + (30 if data["spiral"] else 0)
        job_id = uid()
        directory = Path(os.getenv("KART_UPLOAD_DIR", "private-uploads"))
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / (job_id + ".pdf")
        with target.open("xb") as file:
            file.write(raw)
        try:
            with self.database.transaction() as db:
                actor = self._actor(db, user_id)
                self._student(actor)
                store = self._store(db, actor, store_id)
                if store["type"] != "xerox" or not store["open"]:
                    raise DomainError("Choose an open Xerox shop", 409)
                payment(db, key=f"print:{job_id}:pay", kind="print_purchase", ref=job_id,
                        debit=wallet(user_id), credit=vendor_payable(store["organization_id"]), amount=amount)
                db.execute("INSERT INTO print_jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                    job_id, actor["campus_id"], user_id, store_id, str(target), hashlib.sha256(raw).hexdigest(),
                    name, data["pages"], data["copies"], int(data["color"]), int(data["duplex"]), int(data["spiral"]),
                    amount, "placed", digest(code(job_id)), int(time.time()),
                ))
                self._audit(db, actor, "print.placed", job_id)
                return {"id": job_id, "amount": amount, "status": "placed", "pickup_code": code(job_id)}
        except BaseException:
            target.unlink(missing_ok=True)
            raise

    def print_jobs(self, user_id: str, store_id: str | None = None):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            if store_id:
                store = self._store(db, actor, store_id)
                self._member(db, actor, store["organization_id"])
                rows = db.execute("SELECT * FROM print_jobs WHERE store_id=? ORDER BY created_at DESC", (store_id,))
            else:
                rows = db.execute("SELECT * FROM print_jobs WHERE buyer_id=? ORDER BY created_at DESC", (user_id,))
            return [self._view(job, buyer=job["buyer_id"] == user_id) for job in rows]

    def print_file(self, user_id: str, job_id: str):
        with self.database.connect() as db:
            actor = self._actor(db, user_id)
            job = self._job(db, actor, job_id)
            if job["buyer_id"] != user_id:
                store = self._store(db, actor, job["store_id"])
                self._member(db, actor, store["organization_id"])
            return Path(job["file_path"])

    def advance_print(self, user_id: str, job_id: str, credential: str | None = None):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            job = self._job(db, actor, job_id)
            store = self._store(db, actor, job["store_id"])
            self._member(db, actor, store["organization_id"])
            transitions = {"placed": "preparing", "preparing": "ready", "ready": "collected"}
            if job["status"] not in transitions:
                raise DomainError("Print job cannot advance", 409)
            if job["status"] == "ready" and (not credential or not hmac.compare_digest(digest(credential), job["pickup_hash"])):
                raise DomainError("Invalid pickup credential", 403)
            status = transitions[job["status"]]
            db.execute("UPDATE print_jobs SET status=? WHERE id=?", (status, job_id))
            self._audit(db, actor, "print." + status, job_id)
            return {"id": job_id, "status": status}

    def cancel_print(self, user_id: str, job_id: str):
        with self.database.transaction() as db:
            actor = self._actor(db, user_id)
            job = self._job(db, actor, job_id)
            if job["buyer_id"] != user_id:
                raise DomainError("Not your print job", 403)
            if job["status"] != "placed":
                raise DomainError("Printing has already started", 409)
            active = db.execute("""SELECT 1 FROM task_print_links l JOIN tasks t ON t.id=l.task_id
                WHERE l.print_job_id=? AND t.status NOT IN ('open','cancelled','completed') LIMIT 1""",
                (job_id,)).fetchone()
            if active:
                raise DomainError("Cancel the assigned pickup task first", 409)
            store = self._store(db, actor, job["store_id"])
            payment(db, key=f"print:{job_id}:refund", kind="print_refund", ref=job_id,
                    debit=vendor_payable(store["organization_id"]), credit=wallet(user_id), amount=job["amount"])
            db.execute("UPDATE print_jobs SET status='cancelled' WHERE id=?", (job_id,))
            db.execute("""UPDATE tasks SET status='cancelled' WHERE id IN
                (SELECT task_id FROM task_print_links WHERE print_job_id=?) AND status='open'""", (job_id,))
            self._audit(db, actor, "print.cancelled", job_id)
            return {"id": job_id, "status": "cancelled"}
