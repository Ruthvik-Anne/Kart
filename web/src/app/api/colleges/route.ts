import { NextResponse } from 'next/server';
import { database } from '@/server/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'College directory is unavailable.' }, { status: 503 });
  }
  try {
    const [colleges, demo] = await Promise.all([
      database().query<{ id: string; name: string }>(
        'SELECT id, name FROM colleges WHERE active = true ORDER BY name'),
      // Tells the login page whether the demo accounts can actually be signed in with.
      database().query<{ present: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM accounts WHERE username = 'alex') AS present"),
    ]);
    return NextResponse.json(
      { colleges: colleges.rows, seeded: demo.rows[0]?.present ?? false },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[colleges] lookup failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'College directory is unavailable.' }, { status: 503 });
  }
}
