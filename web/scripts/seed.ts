// Applies the KART schema and initializes an empty campus. Demo users are opt-in.
//   DATABASE_URL=... npx tsx scripts/seed.ts   (or: npm run db:seed)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { emptyState, seed } from '../src/mock/db';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../src/lib/credentials';
import { hashPassword } from '../src/lib/password';

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
  try {
    const schema = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✓ schema applied');

    const existing = await pool.query('SELECT 1 FROM campus_state WHERE campus_id = $1', ['main']);
    if (existing.rowCount === 0) {
      await pool.query('INSERT INTO campus_state (campus_id, data) VALUES ($1, $2::jsonb)', ['main', JSON.stringify(process.env.KART_SEED_DEMO === 'true' ? seed() : emptyState())]);
      console.log('✓ campus state initialized');
    } else {
      console.log('· campus state already present, left untouched');
    }

    if (process.env.KART_SEED_DEMO === 'true') {
      const passwordHash = await hashPassword(DEMO_PASSWORD);
      for (const account of DEMO_ACCOUNTS) {
        await pool.query(
          `INSERT INTO accounts (id, campus_id, username, name, roles, password_hash)
           VALUES ($1, 'main', $2, $3, $4::jsonb, $5)
           ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, name = EXCLUDED.name, roles = EXCLUDED.roles, password_hash = EXCLUDED.password_hash`,
          [account.id, account.username, account.name, JSON.stringify([account.role]), passwordHash]);
      }
      console.log(`✓ ${DEMO_ACCOUNTS.length} demo accounts upserted`);
    }
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
