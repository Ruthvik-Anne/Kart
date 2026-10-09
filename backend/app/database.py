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
CREATE TABLE IF NOT EXISTS audit_chain (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE REFERENCES audit_events(id),
  previous_hash TEXT NOT NULL, event_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY, campus_id TEXT NOT NULL REFERENCES campuses(id),
  name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('vendor','club'))
);
CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT NOT NULL REFERENCES users(id), organization_id TEXT NOT NULL REFERENCES organizations(id),
  role TEXT NOT NULL CHECK(role IN ('owner','staff')), PRIMARY KEY(user_id,organization_id)
);
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY, campus_id TEXT NOT NULL REFERENCES campuses(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id), name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('canteen','xerox','stationery','merch')),
  open INTEGER NOT NULL DEFAULT 1 CHECK(open IN (0,1))
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), name TEXT NOT NULL,
  description TEXT NOT NULL, price INTEGER NOT NULL CHECK(price > 0),
  stock INTEGER NOT NULL CHECK(stock >= 0), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, campus_id TEXT NOT NULL REFERENCES campuses(id),
  buyer_id TEXT NOT NULL REFERENCES users(id), store_id TEXT NOT NULL REFERENCES stores(id),
  request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  status TEXT NOT NULL CHECK(status IN ('placed','preparing','ready','collected','cancelled')),
  pickup_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE(buyer_id,request_key)
);
CREATE INDEX IF NOT EXISTS orders_store_status ON orders(store_id,status,created_at);
CREATE TABLE IF NOT EXISTS order_items (
  order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id),
  name TEXT NOT NULL, price INTEGER NOT NULL CHECK(price > 0), quantity INTEGER NOT NULL CHECK(quantity > 0),
  PRIMARY KEY(order_id,product_id)
);
CREATE TABLE IF NOT EXISTS student_listings (
  id TEXT PRIMARY KEY, campus_id TEXT NOT NULL REFERENCES campuses(id), seller_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
  kind TEXT NOT NULL CHECK(kind IN ('sale','rental')),
  status TEXT NOT NULL CHECK(status IN ('active','reserved','completed','withdrawn')),
  buyer_id TEXT REFERENCES users(id), created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS listings_campus_status ON student_listings(campus_id,status);
CREATE TABLE IF NOT EXISTS rental_terms (
  listing_id TEXT PRIMARY KEY REFERENCES student_listings(id),
  deposit INTEGER NOT NULL CHECK(deposit >= 0),
  max_days INTEGER NOT NULL CHECK(max_days BETWEEN 1 AND 30)
);
CREATE TABLE IF NOT EXISTS rentals (
  id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES student_listings(id),
  campus_id TEXT NOT NULL REFERENCES campuses(id), renter_id TEXT NOT NULL REFERENCES users(id),
  seller_id TEXT NOT NULL REFERENCES users(id), fee INTEGER NOT NULL CHECK(fee > 0),
  deposit INTEGER NOT NULL CHECK(deposit >= 0), duration_days INTEGER NOT NULL CHECK(duration_days BETWEEN 1 AND 30),
  due_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved','active','return_pending','completed','cancelled','disputed')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rentals_parties ON rentals(campus_id,renter_id,seller_id);
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY, campus_id TEXT NOT NULL REFERENCES campuses(id), provider_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS service_bookings (
  id TEXT PRIMARY KEY, campus_id TEXT NOT NULL REFERENCES campuses(id), service_id TEXT NOT NULL REFERENCES services(id),
  buyer_id TEXT NOT NULL REFERENCES users(id), provider_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL CHECK(amount > 0), status TEXT NOT NULL CHECK(status IN ('requested','in_progress','submitted','completed','cancelled','disputed')),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, campus_id TEXT NOT NULL REFERENCES campuses(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id), title TEXT NOT NULL,
  description TEXT NOT NULL, starts_at INTEGER NOT NULL,
  capacity INTEGER NOT NULL CHECK(capacity > 0), price INTEGER NOT NULL CHECK(price >= 0),
  status TEXT NOT NULL CHECK(status IN ('draft','published','cancelled'))
);
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), attendee_id TEXT NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('valid','used','cancelled')),
  created_at INTEGER NOT NULL, UNIQUE(event_id,attendee_id)
);
CREATE INDEX IF NOT EXISTS tickets_event ON tickets(event_id,status);
CREATE TABLE IF NOT EXISTS task_order_links (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id), order_id TEXT NOT NULL REFERENCES orders(id),
  UNIQUE(order_id,task_id)
);
CREATE TABLE IF NOT EXISTS print_jobs (
  id TEXT PRIMARY KEY, campus_id TEXT NOT NULL REFERENCES campuses(id),
  buyer_id TEXT NOT NULL REFERENCES users(id), store_id TEXT NOT NULL REFERENCES stores(id),
  file_path TEXT NOT NULL, file_sha256 TEXT NOT NULL, file_name TEXT NOT NULL,
  pages INTEGER NOT NULL CHECK(pages BETWEEN 1 AND 500), copies INTEGER NOT NULL CHECK(copies BETWEEN 1 AND 20),
  color INTEGER NOT NULL, duplex INTEGER NOT NULL, spiral INTEGER NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  status TEXT NOT NULL CHECK(status IN ('placed','preparing','ready','collected','cancelled')),
  pickup_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS print_jobs_store_status ON print_jobs(store_id,status,created_at);
CREATE TABLE IF NOT EXISTS task_print_links (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id), print_job_id TEXT NOT NULL REFERENCES print_jobs(id)
);
CREATE TABLE IF NOT EXISTS external_identities (
  issuer TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  email TEXT NOT NULL, PRIMARY KEY(issuer,subject)
);
CREATE TABLE IF NOT EXISTS auth_states (
  state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id,expires_at);
"""


class Database:
    def __init__(self, path: str | None = None):
        self.path = path or os.getenv("KART_DB_PATH", "kart.db")
        with self.connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(SCHEMA)
            connection.execute("PRAGMA user_version=1")

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
