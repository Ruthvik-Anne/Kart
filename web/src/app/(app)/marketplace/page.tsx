'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { Badge, Button, CardGrid, Empty, Field, inputCls, kc, Modal, PageHead, Tabs, cx } from '@/components/ui';
import { ItemImage } from '@/components/ItemImage';

type Tab = 'browse' | 'mine';

export default function Marketplace() {
  const { k, me, act } = useKart();
  const [tab, setTab] = useState<Tab>('browse');
  const [query, setQuery] = useState('');
  const [create, setCreate] = useState(false);
  const [rent, setRent] = useState<string | null>(null);
  const [days, setDays] = useState(1);
  const [buying, setBuying] = useState<string | null>(null);
  const [f, setF] = useState({ kind: 'sale' as 'sale' | 'rent', name: '', price: 100, condition: 'Good', desc: '' });
  if (!me) return null;

  const browse    = k.db.listings.filter(l => l.status === 'active' && l.sellerId !== me.id && `${l.name} ${l.desc}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selling   = k.db.listings.filter(l => l.sellerId === me.id && l.status !== 'withdrawn');
  const purchases = k.db.listings.filter(l => l.buyerId === me.id && l.status === 'reserved');
  const rentTarget = rent ? k.listing(rent) : undefined;

  const handleBuy = async (listingId: string) => {
    const l = k.listing(listingId)!;
    setBuying(listingId);
    await act(kart => kart.reserveListing(me, listingId), `Reserved "${l.name}" — arrange handover with seller`);
    setBuying(null);
  };

  return (
    <>
      <PageHead
        kicker="PASS IT ON"
        title="Buy / Sell / Rent"
        sub="Your payment is held in escrow until you confirm the handover."
        action={
          <Button
            onClick={() => setCreate(true)}
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            }
          >
            Create listing
          </Button>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'browse', label: 'Browse', count: browse.length },
          { id: 'mine', label: 'My activity', count: selling.length + purchases.length },
        ]}
      />

      {tab === 'browse' ? (
        <>
          {/* Search */}
          <div className="relative mb-5 max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              aria-label="Search listings"
              className={`${inputCls} pl-8`}
              placeholder="Search listings…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          {browse.length === 0
            ? <Empty icon="🏪" title="Nothing listed right now">Be the first to list something for sale or rent.</Empty>
            : (
              <CardGrid>
                {browse.map(l => (
                  <article key={l.id} className="group overflow-hidden rounded-2xl border border-line bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-brand-200">
                    {/* Image area */}
                    <ItemImage name={l.name} type="listing" className="h-40 w-full transition-transform duration-500 group-hover:scale-105" icon={l.icon} />
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-gold-600">
                          {k.user(l.sellerId)?.name}
                        </span>
                        <Badge tone={l.kind === 'rent' ? 'blue' : 'green'}>
                          {l.kind === 'rent' ? 'For rent' : l.condition}
                        </Badge>
                      </div>
                      <h3 className="mt-1.5 font-display text-base font-bold">{l.name}</h3>
                      <p className="min-h-[2em] text-[11px] leading-snug text-muted">{l.desc}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="font-display text-lg font-bold text-ink">
                          {kc(l.price)}
                          {l.kind === 'rent' && <small className="text-[11px] font-normal text-muted"> / day</small>}
                        </span>
                        {l.kind === 'rent'
                          ? (
                            <Button size="sm" onClick={() => { setRent(l.id); setDays(1); }}>
                              Choose days
                            </Button>
                          )
                          : (
                            <Button
                              size="sm"
                              loading={buying === l.id}
                              onClick={() => handleBuy(l.id)}
                            >
                              Buy now
                            </Button>
                          )}
                      </div>
                    </div>
                  </article>
                ))}
              </CardGrid>
            )}
        </>
      ) : (
        <div className="grid gap-6">
          {/* Purchases */}
          <section>
            <h2 className="mb-3 font-display text-lg font-bold">My purchases & rentals</h2>
            {purchases.length === 0
              ? <Empty icon="🛍️" title="Nothing waiting for handover" />
              : (
                <div className="grid gap-3">
                  {purchases.map(l => (
                    <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl" aria-hidden>{l.icon}</span>
                        <div>
                          <b className="text-xs">{l.name}</b>
                          <div className="text-[10px] text-muted">
                            From {k.user(l.sellerId)?.name} · {kc(l.amount ?? 0)} held
                            {l.kind === 'rent' ? ` for ${l.days} day${l.days === 1 ? '' : 's'}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="gold"
                          onClick={() => act(kart => kart.confirmHandover(me, l.id), 'Handover confirmed — seller paid ✓')}
                        >
                          I got it · Release payment
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => act(kart => kart.cancelReservation(me, l.id), 'Cancelled and refunded')}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </section>

          {/* Listings */}
          <section>
            <h2 className="mb-3 font-display text-lg font-bold">My listings</h2>
            {selling.length === 0
              ? <Empty icon="📦" title="You haven't listed anything">Create your first listing to sell or rent.</Empty>
              : (
                <div className="grid gap-3">
                  {selling.map(l => (
                    <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl" aria-hidden>{l.icon}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <b className="text-xs">{l.name}</b>
                            <Badge tone={l.status === 'sold' ? 'gray' : l.status === 'reserved' ? 'amber' : 'green'} dot>
                              {l.status}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-muted">
                            {kc(l.price)}{l.kind === 'rent' ? ' / day' : ''}
                            {l.status === 'reserved' ? ` · reserved by ${k.user(l.buyerId ?? '')?.name}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {l.status === 'active' && (
                          <Button size="sm" variant="secondary" onClick={() => act(kart => kart.withdrawListing(me, l.id), 'Listing withdrawn')}>
                            Withdraw
                          </Button>
                        )}
                        {l.status === 'reserved' && (
                          <Button size="sm" variant="secondary" onClick={() => act(kart => kart.cancelReservation(me, l.id), 'Reservation cancelled and buyer refunded')}>
                            Cancel reservation
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </section>
        </div>
      )}

      {/* Create listing modal */}
      {create && (
        <Modal title="Create a listing" subtitle="List an item for sale or rent" onClose={() => setCreate(false)}>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={async e => {
              e.preventDefault();
              const r = await act(kart => kart.createListing(me, f), 'Listing published ✓');
              if (r.ok) { setCreate(false); setF({ kind: 'sale', name: '', price: 100, condition: 'Good', desc: '' }); }
            }}
          >
            <Field label="Type">
              <select className={inputCls} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as 'sale' | 'rent' })}>
                <option value="sale">Sell</option>
                <option value="rent">Rent out (per day)</option>
              </select>
            </Field>
            <Field label="Price (KC)">
              <input type="number" min={1} max={100000} required className={inputCls} value={f.price} onChange={e => setF({ ...f, price: Number(e.target.value) })} />
            </Field>
            <Field label="Item name" wide>
              <input required maxLength={70} className={inputCls} placeholder="e.g. Casio Calculator FX-991" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Condition">
              <select className={inputCls} value={f.condition} onChange={e => setF({ ...f, condition: e.target.value })}>
                {['Like new', 'Very good', 'Good', 'Used'].map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Description" wide hint="Describe the item, any defects, and why you're selling.">
              <textarea required maxLength={250} className={`${inputCls} min-h-20 resize-none`} value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} />
            </Field>
            <Button type="submit" className="sm:col-span-2">Publish listing</Button>
          </form>
        </Modal>
      )}

      {/* Rent days modal */}
      {rentTarget && (
        <Modal title={`Rent ${rentTarget.name}`} subtitle={`${kc(rentTarget.price)} / day`} onClose={() => setRent(null)}>
          <form
            className="grid gap-3"
            onSubmit={async e => {
              e.preventDefault();
              const r = await act(kart => kart.reserveListing(me, rentTarget.id, days), 'Rental reserved ✓');
              if (r.ok) setRent(null);
            }}
          >
            <Field label="Number of days" hint="Maximum 30 days">
              <input type="number" min={1} max={30} required className={inputCls} value={days} onChange={e => setDays(Number(e.target.value))} />
            </Field>
            <div className="flex items-center justify-between rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
              <span className="text-sm font-bold text-ink">Total held in escrow</span>
              <span className="font-display text-xl font-bold text-brand-900">{kc(rentTarget.price * (Number.isInteger(days) && days > 0 ? days : 0))}</span>
            </div>
            <Button type="submit">Reserve rental</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
