"""Simulated KC ledger. No payment capture, custody, payout, or exchange."""
import hashlib
import json
import os
import sqlite3
import time
from uuid import uuid4


class LedgerError(ValueError):
    pass


def wallet(user_id: str) -> str:
    return f"wallet:{user_id}"


def reserve(task_id: str) -> str:
    return f"reserve:{task_id}"


def vendor_payable(organization_id: str) -> str:
    return f"vendor_payable:{organization_id}"


def organizer_payable(organization_id: str) -> str:
    return f"organizer_payable:{organization_id}"


def balance(db: sqlite3.Connection, account: str) -> int:
    row = db.execute("""SELECT COALESCE(SUM(CASE side WHEN 'credit' THEN amount ELSE -amount END),0) AS n
                        FROM postings WHERE account=?""", (account,)).fetchone()
    return row["n"]


def post(db: sqlite3.Connection, *, key: str, kind: str, ref: str, debit: str, credit: str, amount: int) -> str:
    if os.getenv("KART_DEMO_MODE") != "1" or os.getenv("KART_DISABLE_KC") == "1":
        raise LedgerError("KC transactions are disabled until payment integration is approved")
    if not isinstance(amount, int) or isinstance(amount, bool) or amount <= 0 or amount > 10_000_000:
        raise LedgerError("Invalid KC amount")
    if debit == credit:
        raise LedgerError("Accounts must differ")
    fingerprint = hashlib.sha256(json.dumps([kind, ref, debit, credit, amount]).encode()).hexdigest()
    existing = db.execute("SELECT id,fingerprint FROM journal WHERE idempotency_key=?", (key,)).fetchone()
    if existing:
        if existing["fingerprint"] != fingerprint:
            raise LedgerError("Idempotency key reused with different transaction")
        return existing["id"]
    if debit != "demo:issuer" and balance(db, debit) < amount:
        raise LedgerError("Insufficient KC balance")
    journal_id = str(uuid4())
    db.execute("INSERT INTO journal VALUES (?,?,?,?,?,?)", (journal_id, key, fingerprint, kind, ref, int(time.time())))
    db.executemany("INSERT INTO postings VALUES (?,?,?,?)", [
        (journal_id, debit, "debit", amount), (journal_id, credit, "credit", amount),
    ])
    return journal_id
