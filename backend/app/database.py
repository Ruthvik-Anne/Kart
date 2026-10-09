"""Transactional SQLite starter. Connections are scoped to each operation."""
from contextlib import contextmanager
import os
import sqlite3


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS campuses (
  id TEXT PRIMARY KEY, name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, campus_id TEXT NOT NULL REFERENCES campuses(id),
  name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','vendor','organizer','moderator','campus_admin','platform_admin')),
  verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1))
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, campus_id TEXT NOT NULL REFERENCES campuses(id),
  poster_id TEXT NOT NULL REFERENCES users(id), assignee_id TEXT REFERENCES users(id),
  title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL,
  anonymous INTEGER NOT NULL, urgency TEXT NOT NULL CHECK(urgency IN ('urgent','scheduled','long_term')),
  pricing TEXT NOT NULL CHECK(pricing IN ('fixed','bidding')),
  budget INTEGER NOT NULL CHECK(budget > 0), agreed_amount INTEGER,
  deadline INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','assigned','in_progress','review','completed','cancelled','disputed')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_campus_status ON tasks(campus_id,status,deadline);
CREATE TABLE IF NOT EXISTS bids (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), bidder_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL CHECK(amount > 0), eta_minutes INTEGER NOT NULL CHECK(eta_minutes > 0),
  note TEXT NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE(task_id,bidder_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
  thread_key TEXT NOT NULL, sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(task_id,thread_key,created_at);
CREATE TABLE IF NOT EXISTS journal (
  id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
  kind TEXT NOT NULL, reference_id TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS postings (
  journal_id TEXT NOT NULL REFERENCES journal(id), account TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('debit','credit')),
  amount INTEGER NOT NULL CHECK(amount > 0)
);
CREATE INDEX IF NOT EXISTS postings_account ON postings(account);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY, campus_id TEXT NOT NULL, actor_id TEXT NOT NULL,
  action TEXT NOT NULL, target_id TEXT NOT NULL, created_at INTEGER NOT NULL
);
"""


class Database:
    def __init__(self, path: str | None = None):
        self.path = path or os.getenv("KART_DB_PATH", "kart.db")
        with self.connect() as connection:
            connection.executescript(SCHEMA)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        db.execute("PRAGMA busy_timeout = 10000")
        try:
            yield db
        finally:
            db.close()

    @contextmanager
    def transaction(self):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                yield db
                db.commit()
            except BaseException:
                db.rollback()
                raise
