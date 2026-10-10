'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { useCart } from '@/components/CartProvider';
import { Button, Empty, Field, inputCls, kc, Modal, cx } from '@/components/ui';

const WINDOWS = ['As soon as ready', '12:30 PM – 1:00 PM', '1:00 PM – 1:30 PM', '4:00 PM – 4:30 PM'];

export function CartModal() {
  const { k, me, act } = useKart();
  const cart = useCart();
  const [window, setWindow] = useState(WINDOWS[0]);
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [deliveryDetails, setDeliveryDetails] = useState('');
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<{ code: string; discount: number; label: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!cart.open || !me) return null;

  const lines = cart.lines.map(l => ({ ...l, p: k.db.products.find(p => p.id === l.productId)! })).filter(l => l.p);
  const subtotal = lines.reduce((a, l) => a + l.p.price * l.qty, 0);
  const live = applied ? k.previewPromo(me, cart.lines, applied.code) : null;
  const discount = live?.ok ? live.discount : 0;
  const total = subtotal - discount;
  const short = total > k.balance(me.id);

  return (
    <Modal
      title="Your cart"
      subtitle={lines.length > 0 ? `${cart.count} item${cart.count !== 1 ? 's' : ''} · ${kc(total)} total` : undefined}
      onClose={() => cart.setOpen(false)}
    >
      {lines.length === 0
        ? (
          <Empty icon="🛒" title="Your cart is empty">
            Browse food, supplies or merch to add items.
          </Empty>
        )
        : (
          <form
            className="grid gap-4"
            onSubmit={async e => {
              e.preventDefault();
              setBusy(true);
              const r = await act(
                (kart, user) => kart.checkout(user, cart.lines, window, live?.ok ? live.code : undefined,
                  fulfillment, deliveryDetails),
                'Order placed! 🎉',
              );
              setBusy(false);
              if (r.ok) { cart.clear(); cart.setOpen(false); setApplied(null); setCode(''); }
            }}
          >
            {/* Line items */}
            <div className="grid gap-2">
              {lines.map(l => (
                <div key={l.productId} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <span className="text-2xl flex-none" aria-hidden>{l.p.icon}</span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/product/${l.p.id}`}
                      onClick={() => cart.setOpen(false)}
                      className="block truncate text-xs font-bold hover:text-brand-800 transition-colors"
                    >
                      {l.p.name}
                    </Link>
                    <div className="text-[10px] text-muted">{k.store(l.p.storeId)?.name} · {kc(l.p.price)} each</div>
                  </div>
                  {/* Quantity stepper */}
                  <div className="flex items-center gap-1 rounded-xl border border-line overflow-hidden flex-none">
                    <button
                      type="button"
                      aria-label={`Remove one ${l.p.name}`}
                      onClick={() => cart.setQty(l.productId, l.qty - 1)}
                      className="flex h-7 w-7 items-center justify-center text-sm font-bold text-ink hover:bg-surface-2 transition-colors"
                    >
                      −
                    </button>
                    <span className="w-7 text-center text-xs font-bold text-ink" aria-live="polite">{l.qty}</span>
                    <button
                      type="button"
                      aria-label={`Add another ${l.p.name}`}
                      disabled={l.qty >= Math.min(l.p.stock, 50)}
                      onClick={() => cart.add(l.productId)}
                      className="flex h-7 w-7 items-center justify-center text-sm font-bold text-ink hover:bg-surface-2 transition-colors disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <span className="flex-none text-xs font-bold text-ink min-w-[4rem] text-right">{kc(l.p.price * l.qty)}</span>
                </div>
              ))}
            </div>

            {/* Fulfilment */}
            <Field label="Receive your order">
              <select className={inputCls} value={fulfillment} onChange={e => setFulfillment(e.target.value as 'pickup' | 'delivery')}>
                <option value="pickup">Collect from shop</option>
                <option value="delivery">Campus delivery</option>
              </select>
            </Field>

            {/* Pickup window */}
            <Field label="Preferred time">
              <select className={inputCls} value={window} onChange={e => setWindow(e.target.value)}>
                {WINDOWS.map(w => <option key={w}>{w}</option>)}
              </select>
            </Field>

            {fulfillment === 'delivery' && (
              <Field label="Delivery location and instructions">
                <textarea required maxLength={200} className={inputCls} value={deliveryDetails} onChange={e => setDeliveryDetails(e.target.value)} placeholder="Building, room and landmark" />
              </Field>
            )}

            {/* Promo code */}
            <div>
              <div className="flex gap-2">
                <input
                  aria-label="Promo code"
                  className={`${inputCls} flex-1`}
                  value={code}
                  placeholder="Promo code"
                  maxLength={16}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const r = k.previewPromo(me, cart.lines, code);
                      if (r.ok) setApplied({ code: r.code, discount: r.discount, label: r.label });
                      else { setApplied(null); act(() => r); }
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!code.trim()}
                  onClick={() => {
                    const r = k.previewPromo(me, cart.lines, code);
                    if (r.ok) setApplied({ code: r.code, discount: r.discount, label: r.label });
                    else { setApplied(null); act(() => r); }
                  }}
                >
                  Apply
                </Button>
              </div>
              {applied && live?.ok && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-success-700">
                  <span aria-hidden>✓</span> {applied.code}: {live.label}. You save {kc(discount)}.
                  <button type="button" className="ml-1 underline hover:no-underline" onClick={() => { setApplied(null); setCode(''); }}>
                    Remove
                  </button>
                </p>
              )}
              {applied && live && !live.ok && (
                <p className="mt-1.5 text-[11px] font-bold text-danger-700">{live.error}</p>
              )}
            </div>

            {/* Order summary */}
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <dl className="grid gap-1 text-xs">
                <div className="flex justify-between text-muted">
                  <dt>Subtotal</dt>
                  <dd>{kc(subtotal)}</dd>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-success-700 font-bold">
                    <dt>Promo {applied?.code}</dt>
                    <dd>−{kc(discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-line pt-2 mt-1 font-bold">
                  <dt>Total</dt>
                  <dd>{kc(total)}</dd>
                </div>
              </dl>
              {/* Balance status */}
              <div className={cx(
                'mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-[11px] font-bold',
                short ? 'bg-danger-100 text-danger-700' : 'bg-success-100 text-success-700',
              )}>
                <span>{short ? '⚠ Insufficient balance' : '◉ Sufficient balance'}</span>
                <span>{kc(k.balance(me.id))} available</span>
              </div>
            </div>

            {short && (
              <p className="text-[11px] text-danger-700">
                <Link href="/wallet" onClick={() => cart.setOpen(false)} className="font-bold underline">
                  Top up your wallet
                </Link>{' '}to place this order.
              </p>
            )}

            <Button type="submit" disabled={short} loading={busy} size="lg">
              Place order · {kc(total)}
            </Button>

            <p className="text-center text-[10px] text-muted">
              One order per store · Discounts funded by KART · Demo KC only
            </p>
          </form>
        )}
    </Modal>
  );
}
