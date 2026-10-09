'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import type { StoreType } from '@/rbac/policy';
import { Badge, Button, Card, DataTable, Empty, Field, inputCls, PageHead } from '@/components/ui';

export default function Vendors() {
  const { k, me, act } = useKart();
  const [f, setF] = useState({ name: '', ownerName: '', type: 'canteen' as StoreType });
  if (!me) return null;
  const pending = k.db.vendorApps.filter(a => a.status === 'pending');
  return (
    <>
      <PageHead kicker="CAMPUS ADMIN" title="Vendors" sub="Onboard campus businesses and review applications." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <h2 className="mb-3 font-display text-base font-bold">Register a vendor</h2>
          <form className="grid gap-3" onSubmit={async e => { e.preventDefault(); const r = await act(kart => kart.registerVendor(me, f), 'Application recorded'); if (r.ok) setF({ ...f, name: '', ownerName: '' }); }}>
            <Field label="Store name"><input required maxLength={50} className={inputCls} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Owner name"><input required maxLength={50} className={inputCls} value={f.ownerName} onChange={e => setF({ ...f, ownerName: e.target.value })} /></Field>
            <Field label="Store type"><select className={inputCls} value={f.type} onChange={e => setF({ ...f, type: e.target.value as StoreType })}><option value="canteen">Canteen</option><option value="xerox">Xerox & print</option><option value="stationery">Stationery</option><option value="merch">Merchandise</option></select></Field>
            <Button type="submit">Submit application</Button>
          </form>
        </Card>
        <div>
          <h2 className="mb-3 font-display text-base font-bold">Pending applications</h2>
          {pending.length === 0 ? <Empty title="No applications waiting" /> : (
            <DataTable head={['Store', 'Type', 'Action']} rows={pending.map(a => [<span key="n"><b>{a.name}</b><br /><span className="text-muted">{a.ownerName}</span></span>, a.type,
              <span key="a" className="flex gap-2"><Button size="sm" onClick={() => act(kart => kart.reviewVendor(me, a.id, true), 'Vendor approved. Their store is live')}>Approve</Button><Button size="sm" variant="secondary" onClick={() => act(kart => kart.reviewVendor(me, a.id, false), 'Rejected')}>Reject</Button></span>])} />
          )}
        </div>
      </div>
      <h2 className="mb-3 mt-8 font-display text-base font-bold">Active stores</h2>
      <DataTable head={['Store', 'Type', 'Owner login', 'Status']} rows={k.db.stores.map(s => [<b key="n">{s.name}</b>, s.type, k.user(s.vendorId)?.name, <Badge key="s" tone={s.open ? 'green' : 'gray'}>{s.open ? 'Open' : 'Closed'}</Badge>])} />
    </>
  );
}
