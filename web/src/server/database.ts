import 'server-only';
import { Pool, type PoolClient } from 'pg';
import type { Db } from '@/mock/db';

let pool: Pool | undefined;

export function database(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in server mode.');
  return pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 10, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function lockedState(client: PoolClient, campusId: string): Promise<Db> {
  const row = await client.query<{ data: Db }>('SELECT data FROM campus_state WHERE campus_id = $1 FOR UPDATE', [campusId]);
  if (row.rowCount !== 1) throw new Error(`Campus ${campusId} is not initialized.`);
  return row.rows[0].data;
}

export async function saveState(client: PoolClient, campusId: string, state: Db): Promise<void> {
  await client.query('UPDATE campus_state SET data = $2::jsonb, version = version + 1, updated_at = now() WHERE campus_id = $1', [campusId, JSON.stringify(state)]);
}
