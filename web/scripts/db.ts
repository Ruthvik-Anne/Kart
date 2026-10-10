// Usage: DATABASE_URL=... npx tsx scripts/db.ts <init|account> [...]
//   init                                   apply db/schema.sql and seed the campus state if empty (no demo logins are created)
//   account <username> <userId>            create a login for an existing user id (password read from KART_PASSWORD)
import { readFileSync } from 'node:fs';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { seed } from '../src/mock/db';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is required.'); process.exit(1); }
const pool = new Pool({ connectionString: url, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
const [cmd, username, userId] = process.argv.slice(2);

async function hash(password: string) {
  const salt = randomBytes(16).toString('hex');
  const out = await promisify(scrypt)(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${out.toString('hex')}`;
}

try {
  if (cmd === 'init') {
    await pool.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
    const r = await pool.query('INSERT INTO campus_state (campus_id, data) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING', ['main', JSON.stringify(seed())]);
    console.log(r.rowCount ? 'Schema applied and campus "main" seeded.' : 'Schema applied; campus "main" already exists.');
  } else if (cmd === 'account' && username && userId) {
    const password = process.env.KART_PASSWORD ?? '';
    if (!/^[a-z][a-z0-9_.-]{2,31}$/.test(username) || password.length < 12) throw new Error('Username must be 3-32 chars (a-z, 0-9, _.-) and KART_PASSWORD at least 12 characters.');
    const state = await pool.query<{ data: { users: { id: string }[] } }>('SELECT data FROM campus_state WHERE campus_id=$1', ['main']);
    if (!state.rows[0]?.data.users.some(u => u.id === userId)) throw new Error(`No user with id ${userId}.`);
    await pool.query('INSERT INTO accounts (id, campus_id, username, password_hash) VALUES ($1,$2,$3,$4)', [userId, 'main', username, await hash(password)]);
    console.log(`Login "${username}" created for ${userId}.`);
  } else {
    console.error('Usage: tsx scripts/db.ts init | account <username> <userId>');
    process.exit(1);
  }
} finally { await pool.end(); }
