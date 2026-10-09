import 'server-only';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { database, lockedState, saveState, transaction } from './database';
import type { User, Role } from '@/rbac/policy';

const scrypt = promisify(scryptCallback);
const COOKIE = 'kart_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const usernamePattern = /^[a-z][a-z0-9_.-]{2,31}$/;

export function validUsername(value: string): boolean { return usernamePattern.test(value); }
export function validPassword(value: string): boolean { return value.length >= 12 && value.length <= 128; }
export function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [kind, salt, expectedHex] = encoded.split(':');
  if (kind !== 'scrypt' || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createAccount(username: string, password: string, name: string, role: Role = 'student', campusId = 'main'): Promise<User> {
  username = username.toLowerCase().trim();
  name = name.trim();
  if (!validUsername(username) || !validPassword(password) || name.length < 2 || name.length > 80) throw new Error('Use a 3–32 character username, a 12+ character password, and a name.');
  const passwordHash = await hashPassword(password);
  return transaction(async client => {
    const state = await lockedState(client, campusId);
    const id = randomUUID();
    const user: User = { id, name, roles: [role], campusId };
    state.users.push(user);
    await client.query('INSERT INTO accounts (id, campus_id, username, password_hash) VALUES ($1,$2,$3,$4)', [id, campusId, username, passwordHash]);
    await saveState(client, campusId, state);
    return user;
  });
}

export async function authenticate(username: string, password: string, campusId = 'main'): Promise<string | null> {
  username = username.toLowerCase().trim();
  if (!validUsername(username) || !password) return null;
  return transaction(async client => {
    const found = await client.query<{ id: string; password_hash: string; failed_logins: number; locked_until: Date | null }>(
      'SELECT id, password_hash, failed_logins, locked_until FROM accounts WHERE campus_id=$1 AND username=$2 FOR UPDATE', [campusId, username]);
    const account = found.rows[0];
    if (!account) return null;
    if (account.locked_until && account.locked_until.getTime() > Date.now()) return null;
    if (!await verifyPassword(password, account.password_hash)) {
      await client.query("UPDATE accounts SET failed_logins=CASE WHEN failed_logins >= 4 THEN 0 ELSE failed_logins+1 END, locked_until=CASE WHEN failed_logins >= 4 THEN now() + interval '15 minutes' ELSE NULL END WHERE id=$1", [account.id]);
      return null;
    }
    await client.query('UPDATE accounts SET failed_logins=0, locked_until=NULL WHERE id=$1', [account.id]);
    const token = randomBytes(32).toString('base64url');
    await client.query("INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1,$2,now() + interval '7 days')", [hashToken(token), account.id]);
    return token;
  });
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS });
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const result = await database().query<{ id: string; campus_id: string }>(
    'SELECT a.id, a.campus_id FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now()', [hashToken(token)]);
  const identity = result.rows[0];
  if (!identity) return null;
  const state = await database().query<{ data: { users: User[] } }>('SELECT data FROM campus_state WHERE campus_id=$1', [identity.campus_id]);
  return state.rows[0]?.data.users.find(u => u.id === identity.id) ?? null;
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await database().query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(token)]);
  jar.delete(COOKIE);
}
