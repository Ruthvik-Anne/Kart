import { NextResponse } from 'next/server';
import { signOut } from '@/server/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await signOut();
  } catch (error) {
    console.error('[auth] logout failed:', error instanceof Error ? error.message : error);
  }
  return NextResponse.json({ ok: true });
}
