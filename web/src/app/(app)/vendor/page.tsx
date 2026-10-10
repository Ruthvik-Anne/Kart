'use client';
import Link from 'next/link';
import { useKart } from '@/mock/StoreProvider';
import { Badge, Button, Card, kc, PageHead, Stat, StatGrid } from '@/components/ui';

export default function VendorConsole() {
  const { k, me, act } = useKart();
  const store = me?.storeId ? k.store(me.storeId) : undefined;
  if (!me || !store) return null;
  const orders = k.db.orders.filter(o => o.storeId === store.id);
  const active = orders.filter(o => ['Placed', 'Preparing', 'Ready'].includes(o.status));
  const revenue = orders.filter(o => o.status !== 'Cancelled').reduce((a, o) => a + o.amount, 0);
  const payable = k.ledger.balance(`VENDOR_PAYABLE:${store.vendorId}`);
  const low = k.db.products.filter(p => p.storeId === store.id && p.stock <= 5);
  const queue = store.type === 'xerox' ? '/vendor/print-queue' : '/vendor/queue';

  return (
    <>
      <PageHead kicker={`${store.type.toUpperCase()} STORE`} title={store.name} sub="Your store at a glance."
        action={<Button variant={store.open ? 'secondary' : 'primary'} onClick={() => act(kart => kart.toggleStore(me, store.id), store.open ? 'Store closed' : 'Store open')}>{store.open ? 'Close store' : 'Open store'}</Button>} />
      <StatGrid>
        <Stat label="Active orders" value={active.length} note={`${orders.length} total`} />
        <Stat label="Sales (gross)" value={kc(revenue)} />
        <Stat label="Awaiting settlement" value={kc(payable)} note="After commission" />
        <Stat label="Customer rating" value={k.storeRating(store.id).count ? `★ ${k.storeRating(store.id).average.toFixed(1)}` : '—'} note={`${k.storeRating(store.id).count} reviews`} />
      </StatGrid>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-display text-base font-bold">Needs attention</h2>
          {active.length === 0 && low.length === 0 && <p className="text-xs text-muted">All caught up.</p>}
          {active.slice(0, 4).map(o => <div key={o.id} className="flex items-center justify-between border-b border-line py-2 text-xs"><span className="truncate font-bold">{o.title}</span><Badge tone="amber">{o.status}</Badge></div>)}
          {low.map(p => <div key={p.id} className="flex items-center justify-between border-b border-line py-2 text-xs"><span>{p.name}</span><Badge tone="red">{p.stock} left</Badge></div>)}
          <Link href={queue} className="mt-3 inline-block text-[11px] font-extrabold text-brand-800 hover:underline">Open {store.type === 'xerox' ? 'print' : 'order'} queue →</Link>
        </Card>
        <Card>
          <h2 className="mb-3 font-display text-base font-bold">Commission</h2>
          <p className="text-xs leading-relaxed text-muted">KART keeps {(k.db.fees.vendorCommissionRate * 100).toFixed(0)}% of each order. Payouts are settled to your bank through the payment partner. Settlement here is simulated until the partner is connected.</p>
          <Link href="/vendor/settlements" className="mt-3 inline-block text-[11px] font-extrabold text-brand-800 hover:underline">View settlements →</Link>
        </Card>
      </div>
    </>
  );
}
