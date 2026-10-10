import { authenticate, currentUser, setSessionCookie, signOut } from '@/server/auth';
import { body, json, sameOrigin, serverMode } from '@/server/http';
import { pgStore } from '@/server/pgStore';
import { viewFor } from '@/server/service';

export const dynamic = 'force-dynamic';

const CAMPUS = 'main';

/** GET: is server mode on, and if so who is signed in plus their filtered snapshot. */
export async function GET() {
  if (!serverMode()) return json({ server: false });
  const user = await currentUser();
  if (!user) return json({ server: true, user: null });
  const db = await pgStore.transaction(user.campusId || CAMPUS, tx => tx.load());
  return json({ server: true, user, db: viewFor(db, user) });
}

/** POST: sign in with username and password. */
export async function POST(req: Request) {
  if (!serverMode()) return json({ ok: false, error: 'Server mode is not enabled.' }, 404);
  if (!sameOrigin(req)) return json({ ok: false, error: 'Bad request.' }, 400);
  const { username, password } = await body(req);
  if (typeof username !== 'string' || typeof password !== 'string') return json({ ok: false, error: 'Enter your username and password.' }, 400);
  const token = await authenticate(username, password, CAMPUS);
  if (!token) return json({ ok: false, error: 'Wrong username or password, or the account is temporarily locked.' }, 401);
  await setSessionCookie(token.token);
  return json({ ok: true });
}

/** DELETE: sign out. */
export async function DELETE(req: Request) {
  if (!serverMode()) return json({ ok: false }, 404);
  if (!sameOrigin(req)) return json({ ok: false }, 400);
  await signOut();
  return json({ ok: true });
}
