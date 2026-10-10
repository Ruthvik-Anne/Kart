import { NextRequest, NextResponse } from 'next/server';
import { activeCollege, createAccount, createSession, setSessionCookie } from '@/server/auth';
import { rateLimit } from '@/server/rateLimit';
import { nameError, normalizeUsername, passwordError, usernameError } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Sign-up is unavailable: the server database is not configured. Copy .env.example to .env.local and run `npm run db:seed`.' }, { status: 503 });
  }
  const fwd = req.headers.get('x-forwarded-for');
  if (!rateLimit(`signup:${(fwd?.split(',')[0]?.trim() || 'local')}`)) {
    return NextResponse.json({ error: 'Too many attempts from this device. Try again in a minute.' }, { status: 429 });
  }

  let body: { name?: unknown; username?: unknown; password?: unknown; campusId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

  const name = String(body.name ?? '').trim();
  const username = normalizeUsername(String(body.username ?? ''));
  const password = String(body.password ?? '');
  const campusId = String(body.campusId ?? '');
  const invalid = nameError(name) ?? usernameError(username) ?? passwordError(password);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  try {
    if (!await activeCollege(campusId)) return NextResponse.json({ error: 'Select an available college.' }, { status: 400 });
    // Self-serve sign-up always lands in the student role; staff roles are seeded only.
    const user = await createAccount({ username, password, name, roles: ['student'], campusId });
    await setSessionCookie(await createSession(user.id));
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sign-up failed.';
    if (message.includes('already taken')) return NextResponse.json({ error: message }, { status: 409 });
    console.error('[auth] signup failed:', message);
    return NextResponse.json({ error: 'Sign-up failed unexpectedly. Try again.' }, { status: 500 });
  }
}
