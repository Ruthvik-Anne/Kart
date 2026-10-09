'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { StarRating } from '@/components/StarRating';
import { Badge, Button, CardGrid, Empty, Modal, PageHead, Field, inputCls, kc, Tabs } from '@/components/ui';
import type { CartLine } from '@/mock/db';

const WINDOWS = ['As soon as ready', '12:30 PM – 1:00 PM', '1:00 PM – 1:30 PM', '4:00 PM – 4:30 PM'];

export function Catalog({ category, kicker, title, sub }: { category: 'food' | 'shop'; kicker: string; title: string; sub: string }) {
  const { k, act } = useKart();
  const [storeId, setStoreId] = useState('all');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [window, setWindow] = useState(WINDOWS[0]);

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

  return (
    <>
      <PageHead kicker={kicker} title={title} sub={sub} action={<Button onClick={() => setShowCart(true)}>🛒 Cart {count > 0 && `(${count})`}</Button>} />
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
            return (
              <article key={p.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                <div className="grid h-28 place-items-center bg-gradient-to-br from-[#e9f1e7] to-[#f8f4e9] text-6xl" aria-hidden>{p.icon}</div>
                <div className="p-4">
                  <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[#5d8369]">
                    <span>{store.name}{k.storeRating(store.id).count > 0 && <span className="ml-1 normal-case tracking-normal text-amber-kart">★ {k.storeRating(store.id).average.toFixed(1)} <span className="text-muted">({k.storeRating(store.id).count})</span></span>}</span>{!store.open ? <Badge tone="gray">Closed</Badge> : p.stock <= 5 ? <Badge tone="amber">{p.stock} left</Badge> : null}
                  </div>
                  <h3 className="mt-1.5 font-display text-base font-bold">{p.name}</h3>
                  <p className="min-h-8 text-[11px] leading-snug text-muted">{p.desc}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-display text-lg font-bold">{kc(p.price)}</span>
                    <Button size="sm" disabled={out || inCart >= p.stock} onClick={() => add(p.id)}>{out ? 'Unavailable' : inCart ? `Add more (${inCart})` : 'Add to cart +'}</Button>
                  </div>
                </div>
              </article>
            );
          })}
        </CardGrid>
      )}
      {showCart && (
        <Modal title="Your cart" onClose={() => setShowCart(false)}>
          {lines.length === 0 ? <Empty title="Your cart is empty">Add something you like.</Empty> : (
            <form onSubmit={async e => {
              e.preventDefault();
              const r = await act((kart, me) => kart.checkout(me, cart, window), 'Order placed');
              if (r.ok) { setCart([]); setShowCart(false); }
            }} className="grid gap-4">
              {lines.map(l => (
                <div key={l.productId} className="flex items-center gap-3 border-b border-line pb-3 text-xs">
                  <span className="text-2xl" aria-hidden>{l.p.icon}</span>
                  <div className="flex-1"><b>{l.p.name}</b><div className="text-muted">{k.store(l.p.storeId)?.name} · {kc(l.p.price)} each</div></div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="secondary" size="sm" aria-label={`Fewer ${l.p.name}`} onClick={() => setCart(c => c.flatMap(x => x.productId === l.productId ? (x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : []) : [x]))}>−</Button>
                    <span className="w-6 text-center font-bold">{l.qty}</span>
                    <Button type="button" variant="secondary" size="sm" aria-label={`More ${l.p.name}`} onClick={() => add(l.productId)}>+</Button>
                  </div>
                </div>
              ))}
              <Field label="Pickup window"><select className={inputCls} value={window} onChange={e => setWindow(e.target.value)}>{WINDOWS.map(w => <option key={w}>{w}</option>)}</select></Field>
              <div className="flex justify-between text-sm font-extrabold"><span>Total</span><span>{kc(total)}</span></div>
              <Button type="submit">Place order · {kc(total)}</Button>
              <p className="text-[10px] text-muted">One order is created per store. Demo KC only.</p>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
