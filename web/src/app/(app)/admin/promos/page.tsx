'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { Badge, Button, Card, DataTable, Field, inputCls, kc, Notice, PageHead } from '@/components/ui';

const blank = { code: '', kind: 'percent' as 'percent' | 'flat', value: 10, cap: 100, min: 100, label: '', maxUses: '' };

export default function Promos() {
  const { k, me, act } = useKart();
  const [f, setF] = useState(blank);
  if (!me) return null;
  const spent = k.ledger.balance('PROMO_CREDITS');
  return (
    <>
      <PageHead kicker="PLATFORM ADMIN" title="Promo codes" sub="Discounts are funded by KART. Stores are always paid on the full price." />
      <Notice tone="green">Total promo spend so far: <b>{kc(spent)}</b>. It is booked as a platform expense in the ledger, so it appears in the trial balance and never reduces a store&apos;s payout.</Notice>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <h2 className="mb-3 font-display text-base font-bold">New or update code</h2>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={async e => {
            e.preventDefault();
            const r = await act((kart, user) => kart.savePromo(user, { code: f.code, kind: f.kind, value: f.value, cap: f.kind === 'percent' ? f.cap : undefined, min: f.min, label: f.label, active: true, maxUses: f.maxUses ? Number(f.maxUses) : undefined }), 'Promo code saved');
            if (r.ok) setF(blank);
          }}>
            <Field label="Code"><input required maxLength={16} className={inputCls} value={f.code} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="e.g. FRESH20" /></Field>
            <Field label="Type"><select className={inputCls} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as 'percent' | 'flat' })}><option value="percent">Percent off</option><option value="flat">Flat KC off</option></select></Field>
            <Field label={f.kind === 'percent' ? 'Percent' : 'KC off'}><input type="number" min={1} required className={inputCls} value={f.value} onChange={e => setF({ ...f, value: Number(e.target.value) })} /></Field>
            {f.kind === 'percent' && <Field label="Max discount (KC)"><input type="number" min={1} className={inputCls} value={f.cap} onChange={e => setF({ ...f, cap: Number(e.target.value) })} /></Field>}
            <Field label="Minimum order (KC)"><input type="number" min={0} className={inputCls} value={f.min} onChange={e => setF({ ...f, min: Number(e.target.value) })} /></Field>
            <Field label="Total uses (optional)"><input type="number" min={1} className={inputCls} value={f.maxUses} onChange={e => setF({ ...f, maxUses: e.target.value })} /></Field>
            <Field label="Description" wide><input required maxLength={80} className={inputCls} value={f.label} onChange={e => setF({ ...f, label: e.target.value })} placeholder="Shown to shoppers" /></Field>
            <Button type="submit" className="sm:col-span-2">Save code</Button>
          </form>
        </Card>
        <div>
          <DataTable head={['Code', 'Offer', 'Used', 'Status']} rows={k.db.promos.map(p => [
            <b key="c">{p.code}</b>,
            <span key="o">{p.label}<br /><span className="text-muted">min {kc(p.min)}</span></span>,
            `${k.promoUsage(p.code)}${p.maxUses ? ` / ${p.maxUses}` : ''}`,
            <span key="s" className="flex items-center gap-2"><Badge tone={p.active ? 'green' : 'gray'}>{p.active ? 'Active' : 'Off'}</Badge><Button size="sm" variant="secondary" onClick={() => act(kart => kart.togglePromo(me, p.code), p.active ? 'Code disabled' : 'Code enabled')}>{p.active ? 'Disable' : 'Enable'}</Button></span>,
          ])} />
        </div>
      </div>
    </>
  );
}
