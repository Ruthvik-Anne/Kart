import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/server/auth';
import { database } from '@/server/database';
import type { Db } from '@/mock/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id || id.length > 100) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  try {
    const result = await database().query<{ id: string; order_id: string; buyer_id: string; store_id: string; name: string; content_type: string; content: Buffer }>(
      'SELECT id, order_id, buyer_id, store_id, name, content_type, content FROM print_files WHERE id=$1 AND campus_id=$2', [id, user.campusId]);
    const file = result.rows[0];
    if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    const stateResult = await database().query<{ data: Db }>('SELECT data FROM campus_state WHERE campus_id=$1', [user.campusId]);
    const state = stateResult.rows[0]?.data;
    const store = state?.stores.find(s => s.id === file.store_id);
    const order = state?.orders.find(o => o.id === file.order_id);
    const allowed = file.buyer_id === user.id || (store?.vendorId === user.id && order?.storeId === store.id);
    if (!allowed || !order?.files?.some(f => f.id === file.id)) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    const safeName = file.name.replace(/[\r\n"\\]/g, '_');
    return new NextResponse(new Uint8Array(file.content), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[print] download failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Could not download this file.' }, { status: 503 });
  }
}
