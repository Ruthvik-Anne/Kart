-- KART auth schema. Apply with: npm run db:seed (or psql "$DATABASE_URL" -f db/schema.sql)

CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY,
  campus_id text NOT NULL DEFAULT 'main',
  username text NOT NULL,
  name text NOT NULL,
  roles jsonb NOT NULL DEFAULT '["student"]'::jsonb,
  password_hash text NOT NULL,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campus_id, username)
);

CREATE TABLE IF NOT EXISTS colleges (
  id text PRIMARY KEY,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
INSERT INTO colleges (id, name, active)
VALUES ('main', 'Velagapudi Ramakrishna Siddhartha Engineering College', true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_account_id_idx ON sessions(account_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

-- Whole-campus state blob. Not read by the auth layer; reserved for the
-- server-side persistence of app data that replaces src/mock later.
CREATE TABLE IF NOT EXISTS campus_state (
  campus_id text PRIMARY KEY,
  data jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS print_files (
  id text PRIMARY KEY,
  campus_id text NOT NULL,
  order_id text NOT NULL,
  buyer_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  name text NOT NULL,
  content_type text NOT NULL,
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS print_files_order_idx ON print_files(campus_id, order_id);
