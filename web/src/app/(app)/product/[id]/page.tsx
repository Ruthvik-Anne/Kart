'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { useCart } from '@/components/CartProvider';
import { WishButton } from '@/components/Catalog';
import { StarRating } from '@/components/StarRating';
import { Badge, Button, Card, Empty, Field, inputCls, kc, Modal, Tabs, when } from '@/components/ui';

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { k, me, act } = useKart();
  const cart = useCart();
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<'reviews' | 'related'>('reviews');
  const [writing, setWriting] = useState(false);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');

  const p = k.db.products.find(x => x.id === id);
  if (!p || !me) return <Empty title="Product not found"><Link href="/food" className="font-bold underline">Browse the catalogue</Link></Empty>;

  const store = k.store(p.storeId)!;
  const rating = k.productRating(p.id);
  const reviews = k.productReviews(p.id);
  const mine = reviews.find(r => r.fromId === me.id);
  const canReview = k.hasBought(me.id, p.id);
  const related = k.db.products.filter(x => x.category === p.category && x.id !== p.id && x.stock > 0).slice(0, 4);
  const inCart = cart.qtyOf(p.id);
  const max = Math.max(0, Math.min(p.stock, 50) - inCart);
  const unavailable = p.stock <= 0 || !store.open;
  const back = p.category === 'food' ? '/food' : '/shop';

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted"><Link className="hover:underline" href="/dashboard">Home</Link> / <Link className="hover:underline" href={back}>{p.category === 'food' ? 'Food' : 'Supplies'}</Link> / <span className="font-bold text-ink">{p.name}</span></nav>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="grid h-64 place-items-center rounded-2xl bg-gradient-to-br from-xe9f1e7 to-xf8f4e9 text-8xl lg:h-80" aria-hidden>{p.icon}</div>
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">{store.name}{store.open ? '' : ' · closed'}</div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">{p.name}</h1>
          <div className="mt-2 flex items-center gap-2 text-xs">
            {rating.count > 0 ? <><StarRating value={Math.round(rating.average)} /> <b>{rating.average.toFixed(1)}</b> <span className="text-muted">({rating.count} review{rating.count === 1 ? '' : 's'})</span></> : <span className="text-muted">No reviews yet</span>}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-x4c6354">{p.desc}</p>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold">{kc(p.price)}</span>
            {p.mrp && p.mrp > p.price && <><s className="text-sm text-muted">{kc(p.mrp)}</s><Badge>Save {kc(p.mrp - p.price)}</Badge></>}
          </div>
          <div className="mt-2">{p.stock <= 0 ? <Badge tone="red">Out of stock</Badge> : p.stock <= 5 ? <Badge tone="amber">Only {p.stock} left</Badge> : <Badge>{p.stock} in stock</Badge>}</div>
          {unavailable ? <p className="mt-4 rounded-xl bg-xfff5dc p-3 text-xs text-x806528">{store.open ? 'Out of stock. The store will restock soon.' : `${store.name} is closed right now.`}</p> : (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1" role="group" aria-label="Quantity">
                <Button type="button" variant="secondary" size="sm" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty(q => q - 1)}>−</Button>
                <span className="w-8 text-center text-sm font-bold" aria-live="polite">{Math.min(qty, Math.max(1, max))}</span>
                <Button type="button" variant="secondary" size="sm" aria-label="Increase quantity" disabled={qty >= max} onClick={() => setQty(q => q + 1)}>+</Button>
              </div>
              <Button disabled={max <= 0} onClick={() => { if (cart.add(p.id, Math.min(qty, max))) { setQty(1); } }}>{max <= 0 ? 'Max in cart' : 'Add to cart'}</Button>
              <Button variant="gold" disabled={max <= 0 && inCart === 0} onClick={() => { if (max > 0) cart.add(p.id, Math.min(qty, max)); cart.setOpen(true); }}>Buy now</Button>
              <WishButton productId={p.id} large />
            </div>
          )}
          {inCart > 0 && <p className="mt-2 text-[11px] text-muted">{inCart} in your cart. <button className="font-bold underline" onClick={() => cart.setOpen(true)}>View cart</button></p>}
          <p className="mt-4 text-[10px] text-muted">Sold by {store.name}. Demo KC only; no real payment is taken.</p>
        </div>
      </div>

      <div className="mt-8">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'reviews', label: `Reviews (${reviews.length})` }, { id: 'related', label: 'Related items' }]} />
        {tab === 'reviews' ? (
          <div className="grid gap-3">
            {canReview
              ? <Card className="!p-4 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span>{mine ? 'You reviewed this item.' : 'You collected this item. How was it?'}</span><Button size="sm" variant="secondary" onClick={() => { setStars(mine?.rating ?? 5); setComment(mine?.comment ?? ''); setWriting(true); }}>{mine ? 'Edit your review' : 'Write a review'}</Button></div></Card>
              : <p className="text-[11px] text-muted">Only people who collected this item can review it.</p>}
            {reviews.length === 0 ? <Empty title="No reviews yet" /> : reviews.map(r => (
              <Card key={r.id} className="!p-4 text-xs"><div className="flex items-center justify-between"><b>{k.user(r.fromId)?.name}{r.fromId === me.id ? ' (you)' : ''}</b><StarRating value={r.rating} /></div>{r.comment && <p className="mt-1 text-x4c6354">{r.comment}</p>}<div className="mt-1 text-[10px] text-muted">Verified buyer · {when(r.ts)}</div></Card>
            ))}
          </div>
        ) : related.length === 0 ? <Empty title="Nothing related right now" /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {related.map(x => <Link key={x.id} href={`/product/${x.id}`} className="rounded-2xl border border-line bg-surface p-4 text-xs hover:shadow-md"><div className="text-3xl" aria-hidden>{x.icon}</div><b className="mt-2 block">{x.name}</b><span className="text-muted">{kc(x.price)}</span></Link>)}
          </div>
        )}
      </div>

      {writing && (
        <Modal title={mine ? 'Edit your review' : `Review ${p.name}`} onClose={() => setWriting(false)}>
          <form className="grid gap-3" onSubmit={async e => { e.preventDefault(); const r = await act(kart => kart.reviewProduct(me, p.id, stars, comment), 'Review saved'); if (r.ok) setWriting(false); }}>
            <StarRating value={stars} onChange={setStars} />
            <Field label="Comment (optional)"><textarea maxLength={300} className={`${inputCls} min-h-20`} value={comment} onChange={e => setComment(e.target.value)} /></Field>
            <Button type="submit">Save review</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
