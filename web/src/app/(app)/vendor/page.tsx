'use client';
import Link from 'next/link';
import { useKart } from '@/mock/StoreProvider';
import { CampusHeader } from '@/components/CampusHeader';
import { Badge, Button, Card, kc, Stat, StatGrid } from '@/components/ui';

const TOOLS = [
  ['/vendor/queue', '⏱', 'Order queue', 'Accept, prepare and hand over'],
  ['/vendor/menu', '🍴', 'Menu & stock', 'Items, prices and availability'],
  ['/vendor/settlements', '◉', 'Settlements', 'Payouts and commission'],
] as const;

export default function VendorConsole() {
  const { k, me, act } = useKart();
  const store = me?.storeId ? k.store(me.storeId) : undefined;
  if (!me || !store) return null;
  const orders = k.db.orders.filter(o => o.storeId === store.id);
  const active = orders.filter(o => ['Placed', 'Preparing', 'Ready', 'Out for delivery'].includes(o.status));
  const revenue = orders.filter(o => o.status !== 'Cancelled').reduce((a, o) => a + o.amount, 0);
  const payable = k.ledger.balance(`VENDOR_PAYABLE:${store.vendorId}`);
  const low = k.db.products.filter(p => p.storeId === store.id && p.stock <= 5);
  const queue = store.type === 'xerox' ? '/vendor/print-queue' : '/vendor/queue';
  const rating = k.storeRating(store.id);

  return (
    <>
      <CampusHeader
        campusId={me.campusId}
        kicker={`${store.type} store`}
        role={store.open ? 'Open' : 'Closed'}
        title={store.name}
        sub="Your store at a glance: incoming orders, stock to watch and what is due to settle."
        actions={
          <>
            <Link href={queue} className="rounded-xl bg-[#eeac54] px-4 py-2.5 text-xs font-extrabold text-forest-950 hover:brightness-95">Open {store.type === 'xerox' ? 'print' : 'order'} queue</Link>
            <Button variant="secondary" className="border-white/40 bg-white/10 text-white hover:bg-white/20"
              onClick={() => act(kart => kart.toggleStore(me, store.id), store.open ? 'Store closed' : 'Store open')}>
              {store.open ? 'Close store' : 'Open store'}
            </Button>
          </>
        }
      />
      <StatGrid>
        <Stat label="Active orders" value={active.length} note={`${orders.length} total`} />
        <Stat label="Sales (gross)" value={kc(revenue)} />
        <Stat label="Awaiting settlement" value={kc(payable)} note="After commission" />
        <Stat label="Customer rating" value={rating.count ? `★ ${rating.average.toFixed(1)}` : '—'} note={`${rating.count} reviews`} />
      </StatGrid>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {TOOLS.filter(([href]) => href !== '/vendor/menu' || store.type !== 'xerox').map(([href, icon, title, sub]) => (
          <Link key={href} href={href} className="rounded-2xl border border-line bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className="mb-2.5 grid h-10 w-10 place-items-center rounded-xl bg-forest-100 text-xl" aria-hidden>{icon}</div>
            <strong className="block font-display text-sm">{title}</strong>
            <span className="mt-0.5 block text-[10px] text-muted">{sub}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-display text-base font-bold">Needs attention</h2>
          {active.length === 0 && low.length === 0 && <p className="text-xs text-muted">All caught up.</p>}
          {active.slice(0, 4).map(o => (
            <div key={o.id} className="flex items-center justify-between gap-3 border-b border-[#eff2ed] py-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-bold">{o.title}</span>
              <span className="flex items-center gap-2">
                {o.fulfillment === 'delivery' && <Badge tone="blue">delivery</Badge>}
                <Badge tone={o.status === 'Ready' || o.status === 'Out for delivery' ? 'amber' : 'green'}>{o.status}</Badge>
              </span>
            </div>
          ))}
          {low.map(p => <div key={p.id} className="flex items-center justify-between border-b border-[#eff2ed] py-2 text-xs"><span>{p.name}</span><Badge tone="red">{p.stock} left</Badge></div>)}
          <Link href={queue} className="mt-3 inline-block text-[11px] font-extrabold text-forest-800">Open {store.type === 'xerox' ? 'print' : 'order'} queue →</Link>
        </Card>
        <Card>
          <h2 className="mb-3 font-display text-base font-bold">Commission</h2>
          <p className="text-xs leading-relaxed text-muted">KART keeps {(k.db.fees.vendorCommissionRate * 100).toFixed(0)}% of each order. Customers pay from their KART wallet the moment they order and prove collection with the QR handover pass — your share sits in payable until you settle. Settlement here is simulated until the payment partner is connected.</p>
          <Link href="/vendor/settlements" className="mt-3 inline-block text-[11px] font-extrabold text-forest-800">View settlements →</Link>
        </Card>
      </div>
    </>
  );
}
