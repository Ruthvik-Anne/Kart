import 'server-only';
import { NextResponse } from 'next/server';
import type { User } from '@/rbac/policy';
import { currentUser } from './auth';

export const serverMode = () => Boolean(process.env.DATABASE_URL);
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Reject cross-site writes: JSON content type, and Origin (when sent) must match the host. */
export function sameOrigin(req: Request): boolean {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === (req.headers.get('host') ?? new URL(req.url).host); } catch { return false; }
}

export async function guard(req: Request): Promise<{ user: User } | { response: NextResponse }> {
  if (!serverMode()) return { response: json({ ok: false, error: 'Server mode is not enabled.' }, 404) };
  if (req.method !== 'GET' && !sameOrigin(req)) return { response: json({ ok: false, error: 'Bad request.' }, 400) };
  const user = await currentUser();
  if (!user) return { response: json({ ok: false, error: 'Please sign in.' }, 401) };
  return { user };
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const text = await req.text();
    if (text.length > 200_000) return {};
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
