import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/server/auth';
import { lockedState, saveState, transaction } from '@/server/database';
import { cleanAttachments, MAX_FILES, MAX_FILE_BYTES, type Attachment } from '@/lib/attachments';
import { Kart } from '@/mock/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (Number(req.headers.get('content-length')) > MAX_FILES * MAX_FILE_BYTES + 100_000) {
    return NextResponse.json({ error: 'Files are too large.' }, { status: 413 });
  }
  try {
    const form = await req.formData();
    const files = form.getAll('files').filter((value): value is File => value instanceof File);
    const cleaned = cleanAttachments(files.map(file => ({ name: file.name, size: file.size })));
    if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
    if (!files.length || files.length > MAX_FILES) return NextResponse.json({ error: 'Attach 1–5 documents.' }, { status: 400 });
    const attachments: Attachment[] = cleaned.files.map(file => ({ ...file, id: randomUUID() }));
    const spec = {
      doc: String(form.get('doc') ?? ''), pages: Number(form.get('pages')), copies: Number(form.get('copies')),
      color: form.get('color') === 'true', duplex: form.get('duplex') === 'true', spiral: form.get('spiral') === 'true',
      paper: String(form.get('paper') ?? 'A4') as 'A4' | 'A3' | 'Legal' | 'Letter',
      binding: String(form.get('binding') ?? 'none') as 'none' | 'staple' | 'comb' | 'spiral',
      lamination: String(form.get('lamination') ?? 'none') as 'none' | 'normal' | 'id',
      notes: String(form.get('notes') ?? ''), window: String(form.get('window') ?? ''),
      fulfillment: form.get('fulfillment') === 'delivery' ? 'delivery' as const : 'pickup' as const,
      deliveryDetails: String(form.get('deliveryDetails') ?? ''),
    };
    const output = await transaction(async client => {
      const state = await lockedState(client, user.campusId);
      const actor = state.users.find(u => u.id === user.id) ?? { ...user };
      if (!state.users.some(u => u.id === actor.id)) state.users.push(actor);
      const kart = new Kart(state);
      const storeId = String(form.get('shop') ?? '');
      const result = kart.placePrintOrder(actor, storeId, spec, attachments);
      if (!result.ok) return result;
      for (let i = 0; i < files.length; i++) {
        const bytes = Buffer.from(await files[i].arrayBuffer());
        await client.query(
          'INSERT INTO print_files (id, campus_id, order_id, buyer_id, store_id, name, content_type, content) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [attachments[i].id, user.campusId, result.orderId, user.id, storeId, attachments[i].name, files[i].type || 'application/octet-stream', bytes]);
      }
      await saveState(client, user.campusId, kart.db);
      return result;
    });
    return NextResponse.json(output, { status: output.ok ? 201 : 400 });
  } catch (error) {
    console.error('[print] order failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Could not place the print request.' }, { status: 500 });
  }
}
