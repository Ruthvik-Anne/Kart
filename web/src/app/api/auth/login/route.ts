import { NextRequest, NextResponse } from 'next/server';
import { activeCollege, authenticate, setSessionCookie } from '@/server/auth';
import { rateLimit, resetRateLimit } from '@/server/rateLimit';
import { normalizeUsername, passwordError, usernameError } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || 'local';
}

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Sign-in is unavailable: the server database is not configured. Copy .env.example to .env.local and run `npm run db:seed`.' }, { status: 503 });
  }
  if (!rateLimit(`login:${clientKey(req)}`)) {
    return NextResponse.json({ error: 'Too many attempts from this device. Try again in a minute.' }, { status: 429 });
  }

  let body: { username?: unknown; password?: unknown; campusId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

  const username = normalizeUsername(String(body.username ?? ''));
  const password = String(body.password ?? '');
  const campusId = String(body.campusId ?? '');
  const invalid = usernameError(username) ?? (passwordError(password) ? 'Enter your password.' : null);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  try {
    if (!await activeCollege(campusId)) return NextResponse.json({ error: 'Select an available college.' }, { status: 400 });
    const result = await authenticate(username, password, campusId);
    if (!result) return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
    resetRateLimit(`login:${clientKey(req)}`); // successes never count against the budget
    await setSessionCookie(result.token);
    return NextResponse.json({ user: result.user });
  } catch (error) {
    console.error('[auth] login failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Sign-in failed unexpectedly. Try again.' }, { status: 500 });
  }
}
