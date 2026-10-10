import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { database, transaction } from './database';
import { burnPasswordCheck, hashPassword, hashToken, verifyPassword } from '@/lib/password';
import { NAME_MAX, NAME_MIN, normalizeUsername, passwordError, PASSWORD_MAX, PASSWORD_MIN, usernameError } from '@/lib/credentials';
import type { Role, User } from '@/rbac/policy';

export const SESSION_COOKIE = 'kart_session';
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

export interface AccountIdentity {
  id: string;
  name: string;
  roles: Role[];
  campusId: string;
}

export { usernameError, passwordError, normalizeUsername, PASSWORD_MIN, PASSWORD_MAX };

export async function activeCollege(campusId: string): Promise<boolean> {
  if (!campusId || campusId.length > 64) return false;
  const result = await database().query('SELECT 1 FROM colleges WHERE id=$1 AND active=true', [campusId]);
  return result.rowCount === 1;
}

export async function createAccount(input: { username: string; password: string; name: string; roles?: Role[]; campusId?: string; id?: string }): Promise<User> {
  const username = normalizeUsername(input.username);
  const name = input.name.trim();
  const roles = input.roles ?? ['student'];
  const campusId = input.campusId ?? 'main';
  const bad = usernameError(username) ?? passwordError(input.password) ??
    (name.length < NAME_MIN || name.length > NAME_MAX ? 'Check your name.' : null);
  if (bad) throw new Error(bad);
  const passwordHash = await hashPassword(input.password);
  const id = input.id ?? randomUUID();
  try {
    await database().query(
      'INSERT INTO accounts (id, campus_id, username, name, roles, password_hash) VALUES ($1,$2,$3,$4,$5::jsonb,$6)',
      [id, campusId, username, name, JSON.stringify(roles), passwordHash]);
  } catch (error) {
    if (error instanceof Error && /duplicate key|unique/i.test(error.message)) throw new Error('That username is already taken.');
    throw error;
  }
  return { id, name, roles, campusId };
}

/** Verify credentials against Postgres. Returns a fresh session token plus the identity, or null. */
export async function authenticate(username: string, password: string, campusId = 'main'): Promise<{ token: string; user: AccountIdentity } | null> {
  username = normalizeUsername(username);
  if (!usernameError(username) && password) {
    return transaction(async client => {
      const found = await client.query<{ id: string; name: string; roles: Role[]; campus_id: string; password_hash: string; failed_logins: number; locked_until: Date | null }>(
        'SELECT id, name, roles, campus_id, password_hash, failed_logins, locked_until FROM accounts WHERE campus_id=$1 AND username=$2 FOR UPDATE', [campusId, username]);
      const account = found.rows[0];
      if (!account) {
        await burnPasswordCheck(password);
        return null;
      }
      if (account.locked_until && account.locked_until.getTime() > Date.now()) return null;
      if (!await verifyPassword(password, account.password_hash)) {
        // 5 wrong tries buy a 15-minute lockout, then the counter starts over.
        await client.query(
          "UPDATE accounts SET failed_logins=CASE WHEN failed_logins >= 4 THEN 0 ELSE failed_logins+1 END, locked_until=CASE WHEN failed_logins >= 4 THEN now() + interval '15 minutes' ELSE NULL END WHERE id=$1",
          [account.id]);
        return null;
      }
      await client.query('UPDATE accounts SET failed_logins=0, locked_until=NULL WHERE id=$1', [account.id]);
      const token = randomBytes(32).toString('base64url');
      await client.query("INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1,$2,now() + interval '7 days')", [hashToken(token), account.id]);
      await client.query("DELETE FROM sessions WHERE expires_at < now()");
      return { token, user: { id: account.id, name: account.name, roles: account.roles, campusId: account.campus_id } };
    });
  }
  await burnPasswordCheck(password || 'x'.repeat(16));
  return null;
}

/** Issue a session row outside of a login transaction (used after sign-up). */
export async function createSession(accountId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await database().query("INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1,$2,now() + interval '7 days')", [hashToken(token), accountId]);
  await database().query('DELETE FROM sessions WHERE expires_at < now()');
  return token;
}

/** Look up the identity behind a raw session token (used by proxy and route handlers). */
export async function sessionUser(token: string | undefined | null): Promise<AccountIdentity | null> {
  if (!token) return null;
  try {
    const result = await database().query<{ id: string; name: string; roles: Role[]; campus_id: string }>(
      'SELECT a.id, a.name, a.roles, a.campus_id FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = $1 AND s.expires_at > now()',
      [hashToken(token)]);
    const row = result.rows[0];
    return row ? { id: row.id, name: row.name, roles: row.roles, campusId: row.campus_id } : null;
  } catch (error) {
    console.error('[auth] session lookup failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}

export async function currentUser(): Promise<AccountIdentity | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return sessionUser(token);
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    try { await database().query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(token)]); }
    catch (error) { console.error('[auth] session delete failed:', error instanceof Error ? error.message : error); }
  }
  jar.delete(SESSION_COOKIE);
}
