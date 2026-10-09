'use client';
import Link from 'next/link';
import { useKart } from '@/mock/StoreProvider';
import { useCart } from '@/components/CartProvider';
import { WishButton } from '@/components/Catalog';
import { Button, Empty, kc, PageHead } from '@/components/ui';

export default function Wishlist() {
  const { k, me } = useKart();
  const cart = useCart();
  if (!me) return null;
  const items = k.wishlistFor(me.id).map(w => k.db.products.find(p => p.id === w.productId)).filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <>
      <PageHead kicker="SAVED FOR LATER" title="Wishlist" sub="Items you've saved. Add them to your cart when you're ready." />
      {items.length === 0 ? <Empty title="Nothing saved yet">Tap ♡ on any product to save it here.</Empty> : (
        <ul className="grid gap-3">
          {items.map(p => {
            const out = p.stock <= 0 || !k.store(p.storeId)?.open;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-xs">
                <span className="text-3xl" aria-hidden>{p.icon}</span>
                <div className="min-w-0 flex-1"><Link href={`/product/${p.id}`} className="font-display text-base font-bold hover:underline">{p.name}</Link><div className="text-muted">{k.store(p.storeId)?.name} · {kc(p.price)}{out ? ' · unavailable' : ''}</div></div>
                <Button size="sm" disabled={out || cart.qtyOf(p.id) >= Math.min(p.stock, 50)} onClick={() => cart.add(p.id)}>Add to cart</Button>
                <WishButton productId={p.id} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
