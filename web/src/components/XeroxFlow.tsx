'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useKart } from '@/mock/StoreProvider';
import { ALLOWED_EXTENSIONS, cleanAttachments, formatSize } from '@/lib/attachments';
import { HandoverPass } from '@/components/HandoverPass';
import { Badge, Button, Card, Empty, Field, inputCls, kc, PageHead, when } from '@/components/ui';
import { BINDING_COST, LAMINATION_COST, PAPER_RATES, type Binding, type Lamination, type PaperSize } from '@/mock/db';

const WINDOWS = ['As soon as ready', '12:30 PM - 1:00 PM', '1:00 PM - 1:30 PM', '4:00 PM - 4:30 PM'];

export function XeroxFlow() {
  const { k, me, refresh } = useKart();
  const shops = k.db.stores.filter(s => s.type === 'xerox');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [placed, setPlaced] = useState<{ id: string; code: string } | null>(null);
  const [f, setF] = useState({ doc: '', pages: 1, copies: 1, color: false, duplex: false,
    paper: 'A4' as PaperSize, binding: 'none' as Binding, lamination: 'none' as Lamination,
    notes: '', shop: '', fulfillment: 'pickup' as 'pickup' | 'delivery', deliveryDetails: '', window: WINDOWS[0] });
  const sheets = f.duplex ? Math.ceil(f.pages / 2) : f.pages;
  const estimate = Math.round(sheets * f.copies * (f.color ? 8 : 2) * PAPER_RATES[f.paper]) + BINDING_COST[f.binding] + LAMINATION_COST[f.lamination];
  const jobs = k.db.orders.filter(o => o.kind === 'print' && o.buyerId === me?.id);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const checked = cleanAttachments(files);
    if (!checked.ok) { setError(checked.error); return; }
    if (!files.length) { setError('Attach at least one document.'); return; }
    setBusy(true); setError('');
    try {
      const body = new FormData();
      Object.entries({ ...f, shop: f.shop || shops[0]?.id || '' }).forEach(([key, value]) => body.set(key, String(value)));
      files.forEach(file => body.append('files', file));
      const response = await fetch('/api/print', { method: 'POST', body });
      const result = await response.json() as { ok?: boolean; orderId?: string; code?: string; error?: string };
      if (!response.ok || !result.ok || !result.orderId || !result.code) throw new Error(result.error || 'Could not send print request.');
      await refresh();
      setPlaced({ id: result.orderId, code: result.code });
      setFiles([]);
      setF(current => ({ ...current, doc: '', notes: '' }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send print request.'); }
    finally { setBusy(false); }
  }

  return <>
    <PageHead kicker="XEROX & PRINT" title="Print documents, your way" sub="Upload your files, set the print details, pay from your KC wallet, and use your code to collect or receive them." />
    {placed && <Card className="mb-5 border-[#b9d6be] bg-forest-100">
      <h2 className="mb-3 font-display text-lg font-bold">Print request placed</h2>
      <HandoverPass orderId={placed.id} code={placed.code} kind="print" status="Placed" fulfillment={k.db.orders.find(o => o.id === placed.id)?.fulfillment} window={k.db.orders.find(o => o.id === placed.id)?.window} amount={k.db.orders.find(o => o.id === placed.id)?.amount} />
      <Link href="/orders" className="mt-3 inline-block text-xs font-bold text-forest-800 underline">View this order</Link>
    </Card>}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card>
        <h2 className="mb-4 font-display text-lg font-bold">New print request</h2>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <Field label="Document name" wide><input required maxLength={80} className={inputCls} value={f.doc} onChange={e => setF({ ...f, doc: e.target.value })} placeholder="e.g. Physics lab report" /></Field>
          <div className="sm:col-span-2"><label htmlFor="print-files" className="mb-1 block text-xs font-bold">Upload documents (1-5 files)</label><input id="print-files" type="file" multiple accept={ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',')} className={inputCls} onChange={e => { const next = [...(e.target.files ?? [])].slice(0, 5); setFiles(next); setError(''); }} />
            <p className="mt-1 text-[10px] text-muted">PDF, Office, OpenDocument, text and image files. Maximum 10 MB per file.</p>
            {files.length > 0 && <ul className="mt-2 grid gap-1">{files.map((file, index) => <li key={`${file.name}-${index}`} className="flex justify-between rounded-lg bg-forest-100 px-3 py-1.5 text-xs"><span className="truncate">{file.name} · {formatSize(file.size)}</span><button type="button" className="font-bold text-red-700" onClick={() => setFiles(current => current.filter((_, i) => i !== index))}>Remove</button></li>)}</ul>}
          </div>
          <Field label="Pages per document"><input type="number" min={1} max={500} required className={inputCls} value={f.pages} onChange={e => setF({ ...f, pages: Number(e.target.value) })} /></Field>
          <Field label="Copies"><input type="number" min={1} max={20} required className={inputCls} value={f.copies} onChange={e => setF({ ...f, copies: Number(e.target.value) })} /></Field>
          <Field label="Paper size"><select className={inputCls} value={f.paper} onChange={e => setF({ ...f, paper: e.target.value as PaperSize })}>{Object.keys(PAPER_RATES).map(size => <option key={size}>{size}</option>)}</select></Field>
          <Field label="Colour"><select className={inputCls} value={f.color ? 'colour' : 'bw'} onChange={e => setF({ ...f, color: e.target.value === 'colour' })}><option value="bw">Black & white</option><option value="colour">Colour</option></select></Field>
          <Field label="Sides"><select className={inputCls} value={f.duplex ? 'double' : 'single'} onChange={e => setF({ ...f, duplex: e.target.value === 'double' })}><option value="single">Single-sided</option><option value="double">Double-sided</option></select></Field>
          <Field label="Binding"><select className={inputCls} value={f.binding} onChange={e => setF({ ...f, binding: e.target.value as Binding })}><option value="none">None</option><option value="staple">Staple</option><option value="comb">Comb</option><option value="spiral">Spiral</option></select></Field>
          <Field label="Lamination"><select className={inputCls} value={f.lamination} onChange={e => setF({ ...f, lamination: e.target.value as Lamination })}><option value="none">None</option><option value="normal">Normal</option><option value="id">ID size</option></select></Field>
          <Field label="Print shop"><select className={inputCls} value={f.shop || shops[0]?.id || ''} onChange={e => setF({ ...f, shop: e.target.value })}>{shops.map(s => <option key={s.id} value={s.id} disabled={!s.open}>{s.name}{s.open ? '' : ' (closed)'}</option>)}</select></Field>
          <Field label="Receive your documents"><select className={inputCls} value={f.fulfillment} onChange={e => setF({ ...f, fulfillment: e.target.value as 'pickup' | 'delivery' })}><option value="pickup">Collect from shop</option><option value="delivery">Campus delivery</option></select></Field>
          <Field label="Preferred time" wide><select className={inputCls} value={f.window} onChange={e => setF({ ...f, window: e.target.value })}>{WINDOWS.map(w => <option key={w}>{w}</option>)}</select></Field>
          {f.fulfillment === 'delivery' && <Field label="Delivery location and instructions" wide><textarea required maxLength={200} className={`${inputCls} min-h-20`} value={f.deliveryDetails} onChange={e => setF({ ...f, deliveryDetails: e.target.value })} placeholder="Building, room and landmark" /></Field>}
          <Field label="Special print instructions" wide><textarea maxLength={300} className={`${inputCls} min-h-20`} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Page range, orientation, paper preference or other needs" /></Field>
          <section aria-label="Payment" className="rounded-xl border border-line bg-forest-100 p-4 sm:col-span-2"><div className="flex justify-between text-xs font-bold"><span>Payment · KC wallet</span><span>{kc(estimate)}</span></div><p className="mt-1 text-[11px] text-muted">Charged when the request is placed. The shop can then download your files and prepare them.</p><div className="mt-2 flex justify-between border-t border-line pt-2 text-xs"><span>Available balance</span><b>{me ? kc(k.balance(me.id)) : '—'}</b></div>{me && k.balance(me.id) < estimate && <Link href="/wallet" className="mt-2 block text-xs font-bold text-red-700 underline">Not enough KC · top up wallet</Link>}</section>
          {error && <p role="alert" className="text-xs font-bold text-red-700 sm:col-span-2">{error}</p>}
          <Button type="submit" disabled={busy || !files.length || !shops.some(s => s.id === (f.shop || shops[0]?.id) && s.open) || !Number.isFinite(estimate) || estimate <= 0} className="sm:col-span-2">{busy ? 'Uploading and placing request…' : `Place print request · ${kc(estimate)}`}</Button>
        </form>
      </Card>
      <section><h2 className="mb-3 font-display text-lg font-bold">Your print jobs</h2>{jobs.length === 0 ? <Empty title="No print jobs yet">Your requests will appear here.</Empty> : <div className="grid gap-3">{jobs.map(o => <Card key={o.id} className="!p-4"><div className="flex justify-between gap-2"><div><p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">{o.id} · {when(o.ts)}</p><h3 className="mt-1 text-xs font-bold">{o.title}</h3><p className="mt-1 text-[11px] text-muted">{k.store(o.storeId)?.name} · {kc(o.amount)}</p></div><Badge tone={o.status === 'Cancelled' ? 'red' : o.status === 'Ready' ? 'amber' : 'green'}>{o.status}</Badge></div><Link href="/orders" className="mt-3 inline-block text-xs font-bold text-forest-800 underline">Open pass and details</Link></Card>)}</div>}</section>
    </div>
  </>;
}
