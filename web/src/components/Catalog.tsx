'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { useCart } from '@/components/CartProvider';
import { StarRating } from '@/components/StarRating';
import { Badge, Button, CardGrid, Empty, PageHead, inputCls, kc, Tabs, cx } from '@/components/ui';
import { ItemImage } from '@/components/ItemImage';

export function WishButton({ productId, large }: { productId: string; large?: boolean }) {
  const { k, me, act } = useKart();
  if (!me) return null;
  const on = k.isWished(me.id, productId);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Remove from wishlist' : 'Save to wishlist'}
      onClick={() => act(kart => kart.toggleWishlist(me, productId), on ? 'Removed from wishlist' : 'Saved ♥')}
      className={cx(
        'grid place-items-center rounded-xl border transition-all duration-150',
        large ? 'h-10 w-10 text-xl' : 'h-8 w-8 text-base',
        on
          ? 'border-red-300 bg-red-50 text-red-500 hover:bg-red-100'
          : 'border-line bg-surface text-muted hover:border-red-300 hover:text-red-400',
      )}
    >
      {on ? '♥' : '♡'}
    </button>
  );
}

export function Catalog({ category, kicker, title, sub }: { category: 'food' | 'shop'; kicker: string; title: string; sub: string }) {
  const { k, me } = useKart();
  const cart = useCart();
  const [storeId, setStoreId] = useState('all');
  const [query, setQuery] = useState('');

  const stores = k.db.stores.filter(s => k.db.products.some(p => p.storeId === s.id && p.category === category));
  const products = k.db.products.filter(p =>
    p.category === category &&
    (storeId === 'all' || p.storeId === storeId) &&
    `${p.name} ${p.desc}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <>
      <PageHead
        kicker={kicker}
        title={title}
        sub={sub}
        action={
          <Button
            onClick={() => cart.setOpen(true)}
            variant={cart.count > 0 ? 'gold' : 'secondary'}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            }
          >
            Cart {cart.count > 0 && `(${cart.count})`}
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          pill
          tabs={[{ id: 'all', label: 'All stores' }, ...stores.map(s => ({ id: s.id, label: s.name }))]}
          value={storeId}
          onChange={setStoreId}
        />
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            aria-label="Search products"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            className={`${inputCls} pl-8 max-w-[14rem]`}
          />
        </div>
      </div>

      {products.length === 0
        ? <Empty icon="🔍" title="Nothing found">Try a different store or search term.</Empty>
        : (
          <CardGrid>
            {products.map(p => {
              const store = k.store(p.storeId)!;
              const inCart = cart.qtyOf(p.id);
              const out = p.stock <= 0 || !store.open;
              const rating = k.productRating(p.id);
              const storeRating = k.storeRating(store.id);
              const discount = p.mrp && p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;

              return (
                <article key={p.id} className="group overflow-hidden rounded-2xl border border-line bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-brand-200">
                  {/* Product image area */}
                  <Link
                    href={`/product/${p.id}`}
                    aria-label={`View ${p.name}`}
                    className="group relative block h-40 overflow-hidden"
                  >
                    <ItemImage name={p.name} type="product" className="h-full w-full transition-transform duration-500 group-hover:scale-105" icon={p.icon} />
                    {discount > 0 && (
                      <span className="absolute top-2 left-2 rounded-full bg-gold-500 px-2 py-0.5 text-[9px] font-bold text-brand-950">
                        {discount}% off
                      </span>
                    )}
                    {!store.open && (
                      <div className="absolute inset-0 flex items-center justify-center bg-brand-950/40 backdrop-blur-sm">
                        <Badge tone="gray">Closed</Badge>
                      </div>
                    )}
                  </Link>

                  <div className="p-4">
                    {/* Store + stock */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gold-600">{store.name}</span>
                      {storeRating.count > 0 && (
                        <span className="text-[10px] text-muted">★ {storeRating.average.toFixed(1)}</span>
                      )}
                    </div>

                    {/* Name */}
                    <h3 className="mt-1 font-display text-base font-bold leading-snug">
                      <Link href={`/product/${p.id}`} className="hover:text-brand-800 transition-colors">{p.name}</Link>
                    </h3>

                    {/* Description */}
                    <p className="mt-0.5 line-clamp-2 min-h-[2em] text-[11px] leading-snug text-muted">{p.desc}</p>

                    {/* Rating */}
                    {rating.count > 0 && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted">
                        <StarRating value={Math.round(rating.average)} />
                        <span>{rating.average.toFixed(1)} ({rating.count})</span>
                      </div>
                    )}

                    {/* Stock warning */}
                    {store.open && p.stock > 0 && p.stock <= 5 && (
                      <p className="mt-1 text-[10px] font-bold text-warning-700">Only {p.stock} left!</p>
                    )}

                    {/* Price + actions */}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-display text-lg font-bold text-ink">{kc(p.price)}</span>
                        {p.mrp && p.mrp > p.price && (
                          <s className="ml-1.5 text-[11px] font-normal text-muted">{kc(p.mrp)}</s>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {me && <WishButton productId={p.id} />}
                        {inCart > 0
                          ? (
                            <div className="flex items-center gap-1 rounded-xl border border-brand-700 overflow-hidden">
                              <button
                                type="button"
                                aria-label={`Remove one ${p.name}`}
                                onClick={() => cart.setQty(p.id, inCart - 1)}
                                className="px-2.5 py-1.5 text-sm font-bold text-brand-900 hover:bg-brand-50 transition-colors"
                              >
                                −
                              </button>
                              <span className="min-w-[1.5rem] text-center text-xs font-bold text-brand-900">{inCart}</span>
                              <button
                                type="button"
                                aria-label={`Add another ${p.name}`}
                                disabled={inCart >= Math.min(p.stock, 50)}
                                onClick={() => cart.add(p.id)}
                                className="px-2.5 py-1.5 text-sm font-bold text-brand-900 hover:bg-brand-50 transition-colors disabled:opacity-40"
                              >
                                +
                              </button>
                            </div>
                          )
                          : (
                            <Button
                              size="sm"
                              disabled={out}
                              onClick={() => cart.add(p.id)}
                            >
                              {out ? 'Unavailable' : '+ Add'}
                            </Button>
                          )}
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
