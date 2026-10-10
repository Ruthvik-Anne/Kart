// scrypt password hashing and session-token digests.
// Runs on the server only (route handlers, proxy, seed script) but lives outside
// src/server so scripts can import it without pulling in the `server-only` guard.
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SCRYPT_KEYLEN = 64;

/** Valid-format hash of a random secret, used to keep unknown-user logins as slow as real ones. */
const DUMMY_HASH = `scrypt:${randomBytes(16).toString('hex')}:${'0'.repeat(SCRYPT_KEYLEN * 2)}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [kind, salt, expectedHex] = encoded.split(':');
  if (kind !== 'scrypt' || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Equal-cost verification for usernames that do not exist, to blunt user enumeration by timing. */
export async function burnPasswordCheck(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
