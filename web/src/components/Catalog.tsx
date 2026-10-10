'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { HandoverPass } from '@/components/HandoverPass';
import { Badge, Button, CardGrid, Empty, Field, inputCls, kc, Modal, PageHead, Tabs } from '@/components/ui';
import type { CartLine } from '@/mock/db';

const WINDOWS = ['As soon as ready', '12:30 PM – 1:00 PM', '1:00 PM – 1:30 PM', '4:00 PM – 4:30 PM'];

interface Placed { orderIds: string[]; codes: string[] }

export function Catalog({ category, kicker, title, sub }: { category: 'food' | 'shop'; kicker: string; title: string; sub: string }) {
  const { k, me, act } = useKart();
  const [storeId, setStoreId] = useState('all');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [slot, setSlot] = useState(WINDOWS[0]);
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [deliveryDetails, setDeliveryDetails] = useState('');
  const [placed, setPlaced] = useState<Placed | null>(null);

  const stores = k.db.stores.filter(s => k.db.products.some(p => p.storeId === s.id && p.category === category));
  const products = k.db.products.filter(p => p.category === category && (storeId === 'all' || p.storeId === storeId)
    && `${p.name} ${p.desc}`.toLowerCase().includes(query.trim().toLowerCase()));
  const lines = cart.map(l => ({ ...l, p: k.db.products.find(p => p.id === l.productId)! })).filter(l => l.p);
  const total = lines.reduce((a, l) => a + l.p.price * l.qty, 0);
  const count = cart.reduce((a, l) => a + l.qty, 0);

  const add = (id: string) => setCart(c => {
    const p = k.db.products.find(x => x.id === id)!;
    const cur = c.find(l => l.productId === id)?.qty ?? 0;
    if (cur >= p.stock) return c;
    return cur ? c.map(l => (l.productId === id ? { ...l, qty: cur + 1 } : l)) : [...c, { productId: id, qty: 1 }];
  });
  const remove = (id: string) => setCart(c => c.filter(l => l.productId !== id));
  const decrement = (id: string) => setCart(c => c.flatMap(l => l.productId === id ? (l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : []) : [l]));

  const place = async () => {
    const r = await act((kart, me) => kart.placeOrder(me, cart, slot, fulfillment, deliveryDetails),
      'Order placed — your QR handover pass is ready');
    if (r.ok) {
      setCart([]);
      setShowCart(false);
      setPlaced({ orderIds: r.orderIds, codes: r.codes });
      setDeliveryDetails('');
    }
  };

  return (
    <>
      <PageHead kicker={kicker} title={title} sub={sub}
        action={<Button onClick={() => setShowCart(true)} aria-label="Open cart">🛒 Cart {count > 0 && `(${count})`}</Button>} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs tabs={[{ id: 'all', label: 'All stores' }, ...stores.map(s => ({ id: s.id, label: s.name }))]} value={storeId} onChange={setStoreId} />
        <input aria-label="Search this page" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" className={`${inputCls} -mt-5 ml-auto max-w-[14rem]`} />
      </div>

      {products.length === 0 ? <Empty title="Nothing found">Try another store or search.</Empty> : (
        <CardGrid>
          {products.map(p => {
            const store = k.store(p.storeId)!;
            const inCart = cart.find(l => l.productId === p.id)?.qty ?? 0;
            const out = p.stock <= 0 || !store.open;
            const rating = k.storeRating(store.id);
            return (
              <article key={p.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                <div className="grid h-28 place-items-center bg-gradient-to-br from-[#e9f1e7] to-[#f8f4e9] text-6xl" aria-hidden>{p.icon}</div>
                <div className="p-4">
                  <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[#5d8369]">
                    <span className="truncate">{store.name}{rating.count > 0 && <span className="ml-1 normal-case tracking-normal text-amber-kart">★ {rating.average.toFixed(1)} <span className="text-muted">({rating.count})</span></span>}</span>
                    {!store.open ? <Badge tone="gray">Closed</Badge> : p.stock <= 5 ? <Badge tone="amber">{p.stock} left</Badge> : null}
                  </div>
                  <h3 className="mt-1.5 font-display text-base font-bold">{p.name}</h3>
                  <p className="min-h-8 text-[11px] leading-snug text-muted">{p.desc}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="font-display text-lg font-bold">{kc(p.price)}</span>
                    {inCart === 0 ? (
                      <Button size="sm" disabled={out} onClick={() => add(p.id)} aria-label={`Add ${p.name} to cart`}>
                        {out ? 'Unavailable' : 'Add to cart +'}
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1 rounded-xl border border-[#cfe0d2] bg-forest-100 p-1">
                        <Button type="button" size="sm" variant="secondary" aria-label={`Remove one ${p.name}`} disabled={inCart <= 1} onClick={() => decrement(p.id)}>−</Button>
                        <span className="min-w-7 text-center text-xs font-extrabold" aria-label={`${p.name} in cart`}>{inCart}</span>
                        <Button type="button" size="sm" variant="secondary" aria-label={`Add one more ${p.name}`} disabled={inCart >= p.stock} onClick={() => add(p.id)}>+</Button>
                        <button type="button" aria-label={`Remove ${p.name} from cart`} onClick={() => remove(p.id)}
                          className="ml-1 rounded-lg px-1.5 py-1 text-sm font-extrabold text-red-700 hover:bg-red-50">×</button>
                      </div>
                    )}
                  </div>
                  {inCart > 0 && <p className="mt-2 text-[10px] font-bold text-[#3e7c45]">{inCart} in cart · {kc(p.price * inCart)}</p>}
                </div>
              </article>
            );
          })}
        </CardGrid>
      )}

      {count > 0 && !showCart && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(16,44,36,0.08)] backdrop-blur md:left-[244px]">
          <div className="mx-auto flex max-w-[1460px] items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-extrabold">{count} {count === 1 ? 'item' : 'items'} · {kc(total)}</p>
              <p className="text-[10px] text-muted">Paid from your KC wallet · QR handover pass included</p>
            </div>
            <Button onClick={() => setShowCart(true)}>View cart →</Button>
          </div>
        </div>
      )}

      {showCart && (
        <Modal title="Your cart" onClose={() => setShowCart(false)}>
          {lines.length === 0 ? <Empty title="Your cart is empty">Add something you like.</Empty> : (
            <form onSubmit={e => { e.preventDefault(); void place(); }} className="grid gap-4">
              <section aria-label="Items in your cart" className="grid gap-2">
                {lines.map(l => (
                  <div key={l.productId} className="flex items-center gap-3 rounded-xl border border-line bg-[#fbfcfa] p-3">
                    <span className="text-2xl" aria-hidden>{l.p.icon}</span>
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-xs">{l.p.name}</b>
                      <div className="text-[10px] text-muted">{k.store(l.p.storeId)?.name} · {kc(l.p.price)} each</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="secondary" size="sm" aria-label={`Fewer ${l.p.name}`} onClick={() => decrement(l.productId)}>−</Button>
                      <span className="w-6 text-center font-bold">{l.qty}</span>
                      <Button type="button" variant="secondary" size="sm" aria-label={`More ${l.p.name}`} disabled={l.qty >= l.p.stock} onClick={() => add(l.productId)}>+</Button>
                    </div>
                    <div className="w-16 text-right text-xs font-extrabold">{kc(l.p.price * l.qty)}</div>
                    <button type="button" aria-label={`Remove ${l.p.name} from cart`} onClick={() => remove(l.productId)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-sm font-extrabold text-red-700 hover:bg-red-50" title="Remove">×</button>
                  </div>
                ))}
                <button type="button" className="justify-self-start text-[11px] font-bold text-red-700 underline" onClick={() => setCart([])}>Clear the whole cart</button>
              </section>

              <div className="grid gap-3 border-t border-line pt-4">
                <Field label="How would you like to receive it?">
                  <select className={inputCls} value={fulfillment} onChange={e => setFulfillment(e.target.value as 'pickup' | 'delivery')}>
                    <option value="pickup">Collect from the shop</option>
                    <option value="delivery">Request campus delivery</option>
                  </select>
                </Field>
                <Field label={fulfillment === 'pickup' ? 'Pickup window' : 'Preferred delivery window'}>
                  <select className={inputCls} value={slot} onChange={e => setSlot(e.target.value)}>{WINDOWS.map(w => <option key={w}>{w}</option>)}</select>
                </Field>
                {fulfillment === 'delivery' && (
                  <Field label="Delivery location and instructions">
                    <textarea required maxLength={200} className={`${inputCls} min-h-20`} value={deliveryDetails}
                      onChange={e => setDeliveryDetails(e.target.value)}
                      placeholder="Building, room or landmark, and contact instructions" />
                  </Field>
                )}
              </div>

              {/* Payment sits at the bottom of the cart, just above the button that places it. */}
              <section aria-label="Payment" className="rounded-xl border border-line bg-forest-100 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold">Payment</h3>
                  <Badge tone="green">KC wallet</Badge>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  {kc(total)} is taken from your KC wallet when you place this order. Show the QR handover pass to collect — the shop never takes cash for app orders.
                </p>
                <dl className="mt-3 grid gap-1 border-t border-[#dce7dc] pt-3 text-xs">
                  <div className="flex justify-between text-muted"><dt>Items ({count})</dt><dd>{kc(total)}</dd></div>
                  <div className="flex justify-between text-muted"><dt>Campus delivery</dt><dd>{fulfillment === 'delivery' ? 'Free' : '—'}</dd></div>
                  <div className="flex justify-between text-muted"><dt>Wallet balance</dt><dd>{me ? kc(k.balance(me.id)) : '—'}</dd></div>
                  <div className="mt-1 flex justify-between border-t border-[#dce7dc] pt-2 font-display text-base font-extrabold text-forest-950"><dt>Total to pay</dt><dd>{kc(total)}</dd></div>
                </dl>
                {me && k.balance(me.id) < total && (
                  <p role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[#fde8e8] px-3 py-2 text-[11px] font-bold text-[#b42318]">
                    Not enough KC for this cart.
                    <a className="underline" href="/wallet">Top up your wallet</a>
                  </p>
                )}
              </section>

              <div className="grid gap-2">
                <Button type="submit">Place order · {kc(total)}</Button>
                <p className="text-center text-[10px] text-muted">One order and one QR handover pass are created per shop. The code is required at collection.</p>
              </div>
            </form>
          )}
        </Modal>
      )}

      {placed && (
        <Modal title="Order placed" onClose={() => setPlaced(null)}>
          <div className="grid gap-4">
            <p className="text-xs leading-relaxed text-muted">
              Your wallet has been charged and these passes are ready. Show the QR code (or read out the code) at the counter to collect — the shop hands over only against it.
            </p>
            {placed.orderIds.map((id, i) => (
              <div key={id} className="rounded-2xl border border-line bg-[#fbfcfa] p-4">
                <HandoverPass orderId={id} code={placed.codes[i] ?? ''} status="Placed"
                  storeName={k.db.orders.find(o => o.id === id) ? k.store(k.db.orders.find(o => o.id === id)!.storeId)?.name : undefined}
                  kind={category === 'food' ? 'food' : 'shop'}
                  fulfillment={fulfillment} window={slot}
                  deliveryDetails={fulfillment === 'delivery' ? deliveryDetails : undefined}
                  amount={k.db.orders.find(o => o.id === id)?.amount} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setPlaced(null)}>Done</Button>
              <a href="/orders" className="inline-flex items-center justify-center rounded-xl border border-[#dce7dc] bg-white px-4 py-2.5 text-xs font-extrabold text-forest-800 hover:bg-forest-100">View my orders</a>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
