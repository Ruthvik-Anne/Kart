import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));

type Row = Record<string, unknown>;
const accounts: Row[] = [];
const sessions: Row[] = [];
const state = { users: [] as Row[] };

const client = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith('SELECT id, password_hash')) return { rows: accounts.filter(a => a.username === params[1]), rowCount: 1 };
    if (sql.startsWith('INSERT INTO accounts')) { accounts.push({ id: params[0], username: params[2], password_hash: params[3], failed_logins: 0, locked_until: null }); return { rows: [] }; }
    if (sql.startsWith('INSERT INTO sessions')) { sessions.push({ token_hash: params[0] }); return { rows: [] }; }
    if (sql.startsWith('UPDATE accounts SET failed_logins=CASE')) {
      const a = accounts.find(x => x.id === params[0])!;
      if ((a.failed_logins as number) >= 4) { a.failed_logins = 0; a.locked_until = new Date(Date.now() + 15 * 60_000); } else a.failed_logins = (a.failed_logins as number) + 1;
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE accounts SET failed_logins=0')) { const a = accounts.find(x => x.id === params[0])!; a.failed_logins = 0; a.locked_until = null; return { rows: [] }; }
    return { rows: [] };
  }),
};

vi.mock('./database', () => ({
  database: () => ({ query: vi.fn() }),
  transaction: async (fn: (c: typeof client) => unknown) => fn(client),
  lockedState: async () => state,
  saveState: async () => undefined,
}));

const { authenticate, createAccount, hashPassword, hashToken, validPassword, validUsername } = await import('./auth');

describe('auth', () => {
  beforeEach(() => { accounts.length = 0; sessions.length = 0; state.users.length = 0; });

  it('validates usernames and passwords', () => {
    expect(validUsername('alex_01')).toBe(true);
    expect(validUsername('A')).toBe(false);
    expect(validUsername('1abc')).toBe(false);
    expect(validPassword('short')).toBe(false);
    expect(validPassword('a-long-enough-pass')).toBe(true);
  });

  it('never stores the plain password and salts each hash', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).not.toContain('correct horse');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt:')).toBe(true);
  });

  it('creates an account, signs in with the right password and stores only a token hash', async () => {
    await createAccount('alex', 'a-long-enough-pass', 'Alex');
    expect(state.users).toHaveLength(1);
    const token = await authenticate('Alex', 'a-long-enough-pass');
    expect(token).toBeTruthy();
    expect(sessions[0].token_hash).toBe(hashToken(token!));
    expect(sessions[0].token_hash).not.toBe(token);
  });

  it('rejects wrong passwords and unknown users the same way', async () => {
    await createAccount('alex', 'a-long-enough-pass', 'Alex');
    expect(await authenticate('alex', 'wrong-password-12')).toBeNull();
    expect(await authenticate('nobody', 'a-long-enough-pass')).toBeNull();
    expect(sessions).toHaveLength(0);
  });

  it('locks the account after five failures, even for the right password', async () => {
    await createAccount('alex', 'a-long-enough-pass', 'Alex');
    for (let i = 0; i < 5; i++) expect(await authenticate('alex', 'wrong-password-12')).toBeNull();
    expect(await authenticate('alex', 'a-long-enough-pass')).toBeNull();
  });

  it('refuses weak registration input', async () => {
    await expect(createAccount('alex', 'short', 'Alex')).rejects.toThrow();
    await expect(createAccount('!!', 'a-long-enough-pass', 'Alex')).rejects.toThrow();
  });
});
