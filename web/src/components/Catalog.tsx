'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { useCart } from '@/components/CartProvider';
import { StarRating } from '@/components/StarRating';
import { Badge, Button, CardGrid, Empty, PageHead, inputCls, kc, Tabs } from '@/components/ui';

export function WishButton({ productId, large }: { productId: string; large?: boolean }) {
  const { k, me, act } = useKart();
  if (!me) return null;
  const on = k.isWished(me.id, productId);
  return (
    <button type="button" aria-pressed={on} aria-label={on ? 'Remove from wishlist' : 'Save to wishlist'}
      onClick={() => act(kart => kart.toggleWishlist(me, productId), on ? 'Removed from wishlist' : 'Saved to wishlist')}
      className={`grid place-items-center rounded-xl border border-line bg-surface ${large ? 'h-10 w-10 text-xl' : 'h-8 w-8 text-base'} ${on ? 'text-red-600' : 'text-x8b9b8e'}`}>{on ? '♥' : '♡'}</button>
  );
}

export function Catalog({ category, kicker, title, sub }: { category: 'food' | 'shop'; kicker: string; title: string; sub: string }) {
  const { k, me } = useKart();
  const cart = useCart();
  const [storeId, setStoreId] = useState('all');
  const [query, setQuery] = useState('');

  const stores = k.db.stores.filter(s => k.db.products.some(p => p.storeId === s.id && p.category === category));
  const products = k.db.products.filter(p => p.category === category && (storeId === 'all' || p.storeId === storeId)
    && `${p.name} ${p.desc}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <PageHead kicker={kicker} title={title} sub={sub} action={<Button onClick={() => cart.setOpen(true)}>🛒 Cart {cart.count > 0 && `(${cart.count})`}</Button>} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs tabs={[{ id: 'all', label: 'All stores' }, ...stores.map(s => ({ id: s.id, label: s.name }))]} value={storeId} onChange={setStoreId} />
        <input aria-label="Search this page" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" className={`${inputCls} -mt-5 ml-auto max-w-[14rem]`} />
      </div>
      {products.length === 0 ? <Empty title="Nothing found">Try another store or search.</Empty> : (
        <CardGrid>
          {products.map(p => {
            const store = k.store(p.storeId)!;
            const inCart = cart.qtyOf(p.id);
            const out = p.stock <= 0 || !store.open;
            const rating = k.productRating(p.id);
            return (
              <article key={p.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
                <Link href={`/product/${p.id}`} aria-label={`View ${p.name}`} className="grid h-28 place-items-center bg-gradient-to-br from-xe9f1e7 to-xf8f4e9 text-6xl" aria-hidden={false}><span aria-hidden>{p.icon}</span></Link>
                <div className="p-4">
                  <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-x5d8369">
                    <span>{store.name}{k.storeRating(store.id).count > 0 && <span className="ml-1 normal-case tracking-normal text-amber-kart">★ {k.storeRating(store.id).average.toFixed(1)} <span className="text-muted">({k.storeRating(store.id).count})</span></span>}</span>{!store.open ? <Badge tone="gray">Closed</Badge> : p.stock <= 5 ? <Badge tone="amber">{p.stock} left</Badge> : null}
                  </div>
                  <h3 className="mt-1.5 font-display text-base font-bold"><Link href={`/product/${p.id}`} className="hover:underline">{p.name}</Link></h3>
                  <p className="min-h-8 text-[11px] leading-snug text-muted">{p.desc}</p>
                  {rating.count > 0 && <div className="mt-1 flex items-center gap-1 text-[10px] text-muted"><StarRating value={Math.round(rating.average)} /> {rating.average.toFixed(1)} ({rating.count})</div>}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="font-display text-lg font-bold">{kc(p.price)}{p.mrp && p.mrp > p.price && <s className="ml-1.5 text-[11px] font-normal text-muted">{kc(p.mrp)}</s>}</span>
                    <div className="flex items-center gap-1.5">
                      {me && <WishButton productId={p.id} />}
                      <Button size="sm" disabled={out || inCart >= Math.min(p.stock, 50)} onClick={() => cart.add(p.id)}>{out ? 'Unavailable' : inCart ? `Add more (${inCart})` : 'Add to cart +'}</Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </CardGrid>
      )}
    </>
  );
}
