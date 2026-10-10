'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { Scanner } from '@/components/Scanner';
import { Badge, Button, Card, Empty, PageHead, when } from '@/components/ui';

export default function DeliveryJobs() {
  const { k, me, act } = useKart();
  const [codes, setCodes] = useState<Record<string, string>>({});
  if (!me) return null;
  const mine = k.db.orders.filter(o => o.fulfillment === 'delivery' && o.runnerId === me.id && o.status !== 'Cancelled');
  const available = k.db.orders.filter(o => o.fulfillment === 'delivery' && o.status === 'Ready' && !o.runnerId && o.buyerId !== me.id);

  return <>
    <PageHead kicker="CAMPUS DELIVERY" title="Delivery jobs" sub="Accept a ready order, collect it from the shop, then ask the customer for their handover code." />
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h2 className="mb-3 font-display text-lg font-bold">Your deliveries</h2>
        {mine.length === 0 ? <Empty title="No active deliveries">Ready orders from nearby shops will appear here.</Empty> : <div className="grid gap-3">{mine.map(o => <Card key={o.id} className="!p-4">
          <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">{o.id} · {when(o.ts)}</p><h3 className="mt-1 text-sm font-bold">{o.title}</h3><p className="text-xs text-muted">Collect from {k.store(o.storeId)?.name}</p></div><Badge tone={o.status === 'Collected' ? 'green' : 'amber'}>{o.status}</Badge></div>
          {o.deliveryDetails && <p className="mt-3 rounded-xl bg-forest-100 p-3 text-xs"><b>Deliver to:</b> {o.deliveryDetails}</p>}
          {o.status === 'Ready' && <p className="mt-3 text-xs text-muted">Go to the shop. The vendor will mark this order as handed to you.</p>}
          {o.status === 'Out for delivery' && <form className="mt-4 grid gap-2 border-t border-line pt-4" onSubmit={async e => { e.preventDefault(); const result = await act(kart => kart.deliverOrder(me, o.id, codes[o.id] ?? ''), 'Delivery confirmed'); if (result.ok) setCodes(current => ({ ...current, [o.id]: '' })); }}>
            <label className="text-xs font-bold text-forest-800">Customer's 8-character handover code<input required maxLength={8} autoComplete="off" value={codes[o.id] ?? ''} onChange={e => setCodes(current => ({ ...current, [o.id]: e.target.value.toUpperCase() }))} className="mt-1 block w-full rounded-xl border border-line px-3 py-2 font-mono uppercase tracking-widest" placeholder="Ask the customer for their code" /></label>
            <div className="flex flex-wrap items-center gap-2"><Button type="submit" size="sm">Confirm delivery</Button><Scanner label="Scan customer's QR" onDetect={d => { if (d.code && (!d.orderId || d.orderId === o.id)) setCodes(current => ({ ...current, [o.id]: d.code! })); }} /></div>
          </form>}
        </Card>)}</div>}
      </section>
      <section>
        <h2 className="mb-3 font-display text-lg font-bold">Available to collect</h2>
        {available.length === 0 ? <Empty title="No orders waiting">Check back when shops mark delivery orders ready.</Empty> : <div className="grid gap-3">{available.map(o => <Card key={o.id} className="!p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">{o.id} · {o.window ?? 'When ready'}</p><h3 className="mt-1 text-sm font-bold">{o.title}</h3><p className="mt-1 text-xs text-muted">Pick up at {k.store(o.storeId)?.name}</p>
          {o.deliveryDetails && <p className="mt-3 rounded-xl bg-forest-100 p-3 text-xs"><b>Drop point:</b> {o.deliveryDetails}</p>}
          <Button size="sm" className="mt-3" onClick={() => void act(kart => kart.acceptDelivery(me, o.id), 'Delivery job accepted')}>Accept delivery</Button>
        </Card>)}</div>}
      </section>
    </div>
  </>;
}
