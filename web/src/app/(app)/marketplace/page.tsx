'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { Badge, Button, CardGrid, Empty, Field, inputCls, kc, Modal, PageHead, Tabs } from '@/components/ui';

type Tab = 'browse' | 'mine';

export default function Marketplace() {
  const { k, me, act } = useKart();
  const [tab, setTab] = useState<Tab>('browse');
  const [query, setQuery] = useState('');
  const [create, setCreate] = useState(false);
  const [rent, setRent] = useState<string | null>(null);
  const [days, setDays] = useState(1);
  const [f, setF] = useState({ kind: 'sale' as 'sale' | 'rent', name: '', price: 100, condition: 'Good', desc: '' });
  if (!me) return null;

  const browse = k.db.listings.filter(l => l.status === 'active' && l.sellerId !== me.id && `${l.name} ${l.desc}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selling = k.db.listings.filter(l => l.sellerId === me.id && l.status !== 'withdrawn');
  const buying = k.db.listings.filter(l => l.buyerId === me.id && l.status === 'reserved');
  const rentTarget = rent ? k.listing(rent) : undefined;

  return (
    <>
      <PageHead kicker="PASS IT ON" title="Buy / Sell / Rent" sub="Your payment is held in escrow until you confirm the handover."
        action={<Button onClick={() => setCreate(true)}>+ Create listing</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'browse', label: `Browse (${browse.length})` }, { id: 'mine', label: `My listings & purchases (${selling.length + buying.length})` }]} />
      {tab === 'browse' ? (
        <>
          <input aria-label="Search listings" className={`${inputCls} mb-4 max-w-xs`} placeholder="Search listings…" value={query} onChange={e => setQuery(e.target.value)} />
          {browse.length === 0 ? <Empty title="Nothing listed right now">Be the first to list something.</Empty> : (
            <CardGrid>
              {browse.map(l => (
                <article key={l.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                  <div className="grid h-28 place-items-center bg-gradient-to-br from-[#e8ecf4] to-[#f8f7ed] text-6xl" aria-hidden>{l.icon}</div>
                  <div className="p-4">
                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[#5d8369]"><span>{k.user(l.sellerId)?.name}</span><Badge tone={l.kind === 'rent' ? 'blue' : 'green'}>{l.kind === 'rent' ? 'For rent' : l.condition}</Badge></div>
                    <h3 className="mt-1.5 font-display text-base font-bold">{l.name}</h3>
                    <p className="min-h-8 text-[11px] text-muted">{l.desc}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-display text-lg font-bold">{kc(l.price)}{l.kind === 'rent' && <small className="text-[11px] font-normal text-muted"> / day</small>}</span>
                      {l.kind === 'rent'
                        ? <Button size="sm" onClick={() => { setRent(l.id); setDays(1); }}>Choose days</Button>
                        : <Button size="sm" onClick={() => { if (confirm(`Reserve "${l.name}" for ${kc(l.price)}? The money is held until you confirm the handover.`)) act(kart => kart.reserveListing(me, l.id), 'Reserved. Arrange the handover with the seller'); }}>Buy now</Button>}
                    </div>
                  </div>
                </article>
              ))}
            </CardGrid>
          )}
        </>
      ) : (
        <div className="grid gap-6">
          <section>
            <h2 className="mb-3 font-display text-lg font-bold">My purchases & rentals</h2>
            {buying.length === 0 ? <Empty title="Nothing waiting for handover" /> : (
              <div className="grid gap-3">{buying.map(l => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 text-xs">
                  <div><b>{l.name}</b><div className="text-muted">From {k.user(l.sellerId)?.name} · {kc(l.amount ?? 0)} held{l.kind === 'rent' ? ` for ${l.days} day${l.days === 1 ? '' : 's'}` : ''}</div></div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => act(kart => kart.confirmHandover(me, l.id), 'Handover confirmed. Seller paid')}>I got it. Release payment</Button>
                    <Button size="sm" variant="secondary" onClick={() => act(kart => kart.cancelReservation(me, l.id), 'Cancelled and refunded')}>Cancel</Button>
                  </div>
                </div>))}</div>
            )}
          </section>
          <section>
            <h2 className="mb-3 font-display text-lg font-bold">My listings</h2>
            {selling.length === 0 ? <Empty title="You haven't listed anything" /> : (
              <div className="grid gap-3">{selling.map(l => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 text-xs">
                  <div><b>{l.name}</b> <Badge tone={l.status === 'sold' ? 'gray' : l.status === 'reserved' ? 'amber' : 'green'}>{l.status}</Badge>
                    <div className="text-muted">{kc(l.price)}{l.kind === 'rent' ? ' / day' : ''}{l.status === 'reserved' ? ` · reserved by ${k.user(l.buyerId ?? '')?.name}` : ''}</div></div>
                  <div className="flex gap-2">
                    {l.status === 'active' && <Button size="sm" variant="secondary" onClick={() => act(kart => kart.withdrawListing(me, l.id), 'Listing withdrawn')}>Withdraw</Button>}
                    {l.status === 'reserved' && <Button size="sm" variant="secondary" onClick={() => act(kart => kart.cancelReservation(me, l.id), 'Reservation cancelled and buyer refunded')}>Cancel reservation</Button>}
                  </div>
                </div>))}</div>
            )}
          </section>
        </div>
      )}

      {create && (
        <Modal title="Create a listing" onClose={() => setCreate(false)}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={async e => { e.preventDefault(); const r = await act(kart => kart.createListing(me, f), 'Listing published'); if (r.ok) { setCreate(false); setF({ kind: 'sale', name: '', price: 100, condition: 'Good', desc: '' }); } }}>
            <Field label="Type"><select className={inputCls} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as 'sale' | 'rent' })}><option value="sale">Sell</option><option value="rent">Rent out (per day)</option></select></Field>
            <Field label="Price (KC)"><input type="number" min={1} max={100000} required className={inputCls} value={f.price} onChange={e => setF({ ...f, price: Number(e.target.value) })} /></Field>
            <Field label="Item name" wide><input required maxLength={70} className={inputCls} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Condition"><select className={inputCls} value={f.condition} onChange={e => setF({ ...f, condition: e.target.value })}>{['Like new', 'Very good', 'Good', 'Used'].map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Description" wide><textarea required maxLength={250} className={`${inputCls} min-h-20`} value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} /></Field>
            <Button type="submit" className="sm:col-span-2">Publish listing</Button>
          </form>
        </Modal>
      )}
      {rentTarget && (
        <Modal title={`Rent ${rentTarget.name}`} onClose={() => setRent(null)}>
          <form className="grid gap-3" onSubmit={async e => { e.preventDefault(); const r = await act(kart => kart.reserveListing(me, rentTarget.id, days), 'Rental reserved'); if (r.ok) setRent(null); }}>
            <Field label="Number of days (1-30)"><input type="number" min={1} max={30} required className={inputCls} value={days} onChange={e => setDays(Number(e.target.value))} /></Field>
            <div className="flex justify-between rounded-xl bg-forest-100 px-4 py-3 text-sm font-extrabold"><span>Total held in escrow</span><span>{kc(rentTarget.price * (Number.isInteger(days) && days > 0 ? days : 0))}</span></div>
            <Button type="submit">Reserve rental</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
