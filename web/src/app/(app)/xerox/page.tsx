'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { FilePicker, AttachmentList } from '@/components/FilePicker';
import type { FileLike } from '@/lib/attachments';
import { Badge, Button, Card, Empty, Field, inputCls, kc, Notice, PageHead, when } from '@/components/ui';

export default function Xerox() {
  const { k, me, act } = useKart();
  const shops = k.db.stores.filter(s => s.type === 'xerox');
  const [file, setFile] = useState<FileLike[]>([]);
  const [f, setF] = useState({ doc: '', pages: 10, copies: 1, color: false, duplex: false, spiral: false, shop: shops[0]?.id ?? '' });

  const sheets = f.duplex ? Math.ceil(f.pages / 2) : f.pages;
  const estimate = Number.isInteger(f.pages) && Number.isInteger(f.copies) ? sheets * f.copies * (f.color ? 8 : 2) + (f.spiral ? 30 : 0) : 0;
  const jobs = k.db.orders.filter(o => o.kind === 'print' && o.buyerId === me?.id);

  return (
    <>
      <PageHead kicker="XEROX & PRINT" title="Print documents, your way" sub="Choose pages, copies, colour and binding, then collect from the shop." />
      <Notice>Demo only: the shop sees your file name and size, but file contents are not uploaded or stored yet. Secure document storage comes with the backend, so don&apos;t share sensitive documents.</Notice>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <h2 className="mb-4 font-display text-lg font-bold">New print request</h2>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={async e => {
            e.preventDefault();
            const r = await act((kart, user) => kart.printRequest(user, f.shop, { ...f, file: file[0] }), 'Print request sent to the shop');
            if (r.ok) { setF(x => ({ ...x, doc: '' })); setFile([]); }
          }}>
            <Field label="Document name" wide><input required maxLength={80} className={inputCls} value={f.doc} onChange={e => setF({ ...f, doc: e.target.value })} placeholder="e.g. Physics lab report.pdf" /></Field>
            <div className="sm:col-span-2"><FilePicker files={file} onChange={setFile} max={1} label="Attach your document" /></div>
            <Field label="Pages"><input type="number" min={1} max={500} required className={inputCls} value={f.pages} onChange={e => setF({ ...f, pages: Number(e.target.value) })} /></Field>
            <Field label="Copies"><input type="number" min={1} max={20} required className={inputCls} value={f.copies} onChange={e => setF({ ...f, copies: Number(e.target.value) })} /></Field>
            <Field label="Colour"><select className={inputCls} value={f.color ? 'c' : 'b'} onChange={e => setF({ ...f, color: e.target.value === 'c' })}><option value="b">Black & white (2 KC/page)</option><option value="c">Colour (8 KC/page)</option></select></Field>
            <Field label="Sides"><select className={inputCls} value={f.duplex ? 'd' : 's'} onChange={e => setF({ ...f, duplex: e.target.value === 'd' })}><option value="s">Single-sided</option><option value="d">Double-sided</option></select></Field>
            <Field label="Binding"><select className={inputCls} value={f.spiral ? 'y' : 'n'} onChange={e => setF({ ...f, spiral: e.target.value === 'y' })}><option value="n">None</option><option value="y">Spiral (+30 KC)</option></select></Field>
            <Field label="Print shop"><select className={inputCls} value={f.shop} onChange={e => setF({ ...f, shop: e.target.value })}>{shops.map(s => <option key={s.id} value={s.id} disabled={!s.open}>{s.name}{s.open ? '' : ' (closed)'}</option>)}</select></Field>
            <div className="flex items-center justify-between rounded-xl bg-forest-100 px-4 py-3 text-sm font-extrabold sm:col-span-2"><span>Estimate</span><span>{kc(estimate)}</span></div>
            <Button type="submit" className="sm:col-span-2">Send print request · {kc(estimate)}</Button>
          </form>
        </Card>
        <div>
          <h2 className="mb-3 font-display text-lg font-bold">Your print jobs</h2>
          {jobs.length === 0 ? <Empty title="No print jobs yet">Your requests will appear here.</Empty> : (
            <div className="grid gap-3">
              {jobs.map(o => (
                <Card key={o.id} className="!p-4">
                  <div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-extrabold uppercase tracking-wider text-[#5d8369]">{o.id} · {when(o.ts)}</div><div className="mt-1 text-xs font-bold">{o.title}</div><div className="text-[11px] text-muted">{k.store(o.storeId)?.name} · {kc(o.amount)}</div><AttachmentList files={o.files} /></div><Badge tone={o.status === 'Cancelled' ? 'red' : o.status === 'Ready' ? 'amber' : 'green'}>{o.status}</Badge></div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
