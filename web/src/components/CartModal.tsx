'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { useCart } from '@/components/CartProvider';
import { Button, Empty, Field, inputCls, kc, Modal } from '@/components/ui';

const WINDOWS = ['As soon as ready', '12:30 PM – 1:00 PM', '1:00 PM – 1:30 PM', '4:00 PM – 4:30 PM'];

export function CartModal() {
  const { k, me, act } = useKart();
  const cart = useCart();
  const [window, setWindow] = useState(WINDOWS[0]);
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<{ code: string; discount: number; label: string } | null>(null);
  if (!cart.open || !me) return null;

  const lines = cart.lines.map(l => ({ ...l, p: k.db.products.find(p => p.id === l.productId)! })).filter(l => l.p);
  const subtotal = lines.reduce((a, l) => a + l.p.price * l.qty, 0);
  // Re-check the applied code against the current cart so a stale discount can never be shown.
  const live = applied ? k.previewPromo(me, cart.lines, applied.code) : null;
  const discount = live?.ok ? live.discount : 0;
  const total = subtotal - discount;
  const short = total > k.balance(me.id);

  return (
    <Modal title="Your cart" onClose={() => cart.setOpen(false)}>
      {lines.length === 0 ? <Empty title="Your cart is empty">Add something you like.</Empty> : (
        <form className="grid gap-4" onSubmit={async e => {
          e.preventDefault();
          const r = await act((kart, user) => kart.checkout(user, cart.lines, window, live?.ok ? live.code : undefined), 'Order placed');
          if (r.ok) { cart.clear(); cart.setOpen(false); setApplied(null); setCode(''); }
        }}>
          {lines.map(l => (
            <div key={l.productId} className="flex items-center gap-3 border-b border-line pb-3 text-xs">
              <span className="text-2xl" aria-hidden>{l.p.icon}</span>
              <div className="min-w-0 flex-1"><Link href={`/product/${l.p.id}`} onClick={() => cart.setOpen(false)} className="font-bold hover:underline">{l.p.name}</Link><div className="text-muted">{k.store(l.p.storeId)?.name} · {kc(l.p.price)} each</div></div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="secondary" size="sm" aria-label={`Fewer ${l.p.name}`} onClick={() => cart.setQty(l.productId, l.qty - 1)}>−</Button>
                <span className="w-6 text-center font-bold" aria-live="polite">{l.qty}</span>
                <Button type="button" variant="secondary" size="sm" aria-label={`More ${l.p.name}`} disabled={l.qty >= Math.min(l.p.stock, 50)} onClick={() => cart.add(l.productId)}>+</Button>
              </div>
            </div>
          ))}
          <Field label="Pickup window"><select className={inputCls} value={window} onChange={e => setWindow(e.target.value)}>{WINDOWS.map(w => <option key={w}>{w}</option>)}</select></Field>
          <div>
            <div className="flex gap-2">
              <input aria-label="Promo code" className={inputCls} value={code} placeholder="Promo code" maxLength={16} onChange={e => setCode(e.target.value.toUpperCase())} />
              <Button type="button" variant="secondary" size="sm" disabled={!code.trim()} onClick={() => {
                const r = k.previewPromo(me, cart.lines, code);
                if (r.ok) setApplied({ code: r.code, discount: r.discount, label: r.label });
                else { setApplied(null); act(() => r); }
              }}>Apply</Button>
            </div>
            {applied && live?.ok && <p className="mt-1.5 text-[11px] font-bold text-x2f7a45">✓ {applied.code}: {live.label}. You save {kc(discount)}. <button type="button" className="underline" onClick={() => { setApplied(null); setCode(''); }}>Remove</button></p>}
            {applied && live && !live.ok && <p className="mt-1.5 text-[11px] font-bold text-red-700">{live.error}</p>}
          </div>
          <dl className="grid gap-1 text-xs">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{kc(subtotal)}</dd></div>
            {discount > 0 && <div className="flex justify-between text-x2f7a45"><dt>Promo {applied?.code}</dt><dd>−{kc(discount)}</dd></div>}
            <div className="flex justify-between text-sm font-extrabold"><dt>Total</dt><dd>{kc(total)}</dd></div>
          </dl>
          {short && <p role="alert" className="text-[11px] font-bold text-red-700">Your wallet has {kc(k.balance(me.id))}. <Link href="/wallet" onClick={() => cart.setOpen(false)} className="underline">Top up</Link> to place this order.</p>}
          <Button type="submit" disabled={short}>Place order · {kc(total)}</Button>
          <p className="text-[10px] text-muted">One order is created per store. Discounts are funded by KART, and stores are paid on the full price. Demo KC only.</p>
        </form>
      )}
    </Modal>
  );
}
