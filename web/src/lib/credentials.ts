// Credential rules and the demo account catalog.
// Shared by the login form (client) and the auth API (server) so both agree on validation.
import type { Role } from '@/rbac/policy';

export const USERNAME_PATTERN = /^[a-z][a-z0-9_.-]{2,31}$/;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
export const NAME_MIN = 2;
export const NAME_MAX = 80;

export function normalizeUsername(value: string): string {
  return value.toLowerCase().trim();
}

export function usernameError(value: string): string | null {
  const v = normalizeUsername(value);
  if (!v) return 'Enter your username.';
  if (!USERNAME_PATTERN.test(v)) return 'Start with a letter, then a–z, 0–9, “.”, “_” or “-” (3–32 characters).';
  return null;
}

export function passwordError(value: string): string | null {
  if (!value) return 'Enter your password.';
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (value.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return null;
}

export function nameError(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Enter your full name.';
  if (v.length < NAME_MIN || v.length > NAME_MAX) return `Names run ${NAME_MIN}–${NAME_MAX} characters.`;
  return null;
}

/** Demo credentials seeded into Postgres by `npm run db:seed`. */
export const DEMO_PASSWORD = 'kart-demo-2026';

export interface DemoAccount {
  id: string;
  username: string;
  name: string;
  role: Role;
  note?: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { id: 'u-alex', username: 'alex', name: 'Alex Sharma', role: 'student' },
  { id: 'u-riya', username: 'riya', name: 'Riya M.', role: 'student', note: 'verified provider' },
  { id: 'u-nikhil', username: 'nikhil', name: 'Nikhil K.', role: 'student', note: 'verified provider' },
  { id: 'u-meera', username: 'meera', name: 'Meera P.', role: 'student' },
  { id: 'v-bites', username: 'bites', name: 'Campus Bites', role: 'vendor', note: 'canteen store' },
  { id: 'v-green', username: 'green', name: 'Green Plate', role: 'vendor', note: 'canteen store' },
  { id: 'v-xerox', username: 'xerox', name: 'Library Xerox', role: 'vendor', note: 'xerox store' },
  { id: 'v-scholars', username: 'scholars', name: 'Scholars Store', role: 'vendor', note: 'stationery store' },
  { id: 'a-dean', username: 'dean', name: 'Dr. Rao (Campus Admin)', role: 'campus_admin' },
  { id: 'p-ops', username: 'ops', name: 'Platform Ops', role: 'platform_admin' },
];

export const DEMO_GROUP_TITLES: Record<Role, string> = {
  student: 'Students',
  vendor: 'Vendors',
  campus_admin: 'Campus administrators',
  platform_admin: 'Platform administrators',
};
