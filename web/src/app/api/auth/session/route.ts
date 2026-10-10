import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** Current session identity, used by the client store to hydrate on load. */
export async function GET(req: NextRequest) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ user: null });
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  try {
    return NextResponse.json({ user: await sessionUser(token) });
  } catch (error) {
    console.error('[auth] session lookup failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ user: null });
  }
}
