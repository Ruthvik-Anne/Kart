import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));

type Account = { id: string; campus_id: string; username: string; name: string; roles: string[]; password_hash: string; failed_logins: number; locked_until: Date | null };
const accounts: Account[] = [];
const sessions: string[] = [];
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  if (sql.startsWith('INSERT INTO accounts')) {
    accounts.push({ id: String(params[0]), campus_id: String(params[1]), username: String(params[2]), name: String(params[3]),
      roles: JSON.parse(String(params[4])), password_hash: String(params[5]), failed_logins: 0, locked_until: null });
    return { rows: [], rowCount: 1 };
  }
  if (sql.startsWith('SELECT id, name, roles, campus_id, password_hash')) {
    const account = accounts.find(a => a.campus_id === params[0] && a.username === params[1]);
    return { rows: account ? [account] : [], rowCount: account ? 1 : 0 };
  }
  if (sql.startsWith('INSERT INTO sessions')) { sessions.push(String(params[0])); return { rows: [], rowCount: 1 }; }
  if (sql.startsWith('UPDATE accounts SET failed_logins=CASE')) {
    const account = accounts.find(a => a.id === params[0])!;
    if (account.failed_logins >= 4) { account.failed_logins = 0; account.locked_until = new Date(Date.now() + 15 * 60_000); }
    else account.failed_logins += 1;
  }
  if (sql.startsWith('UPDATE accounts SET failed_logins=0')) {
    const account = accounts.find(a => a.id === params[0])!;
    account.failed_logins = 0; account.locked_until = null;
  }
  return { rows: [], rowCount: 0 };
});
vi.mock('./database', () => ({ database: () => ({ query }), transaction: async (fn: (client: { query: typeof query }) => unknown) => fn({ query }) }));
const { createAccount, authenticate, usernameError, passwordError } = await import('./auth');
const { hashToken } = await import('@/lib/password');

describe('auth', () => {
  beforeEach(() => { accounts.length = 0; sessions.length = 0; query.mockClear(); });
  it('validates registration fields', () => {
    expect(usernameError('alex_01')).toBeNull();
    expect(usernameError('A')).toBeTruthy();
    expect(passwordError('short')).toBeTruthy();
    expect(passwordError('a-long-enough-pass')).toBeNull();
  });
  it('stores password and session hashes', async () => {
    const user = await createAccount({ username: 'alex', password: 'a-long-enough-pass', name: 'Alex' });
    expect(accounts[0].password_hash).not.toContain('a-long-enough-pass');
    const session = await authenticate('Alex', 'a-long-enough-pass');
    expect(session?.user.id).toBe(user.id);
    expect(sessions[0]).toBe(hashToken(session!.token));
    expect(sessions[0]).not.toBe(session!.token);
  });
  it('locks after repeated failures', async () => {
    await createAccount({ username: 'alex', password: 'a-long-enough-pass', name: 'Alex' });
    expect(await authenticate('nobody', 'a-long-enough-pass')).toBeNull();
    for (let i = 0; i < 5; i++) expect(await authenticate('alex', 'wrong-password-12')).toBeNull();
    expect(await authenticate('alex', 'a-long-enough-pass')).toBeNull();
    expect(sessions).toHaveLength(0);
  });
});
