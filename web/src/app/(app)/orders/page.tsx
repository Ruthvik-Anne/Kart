'use client';
import { useKart } from '@/mock/StoreProvider';
import { useState } from 'react';
import { StarRating } from '@/components/StarRating';
import { HandoverPass } from '@/components/HandoverPass';
import { AttachmentList } from '@/components/FilePicker';
import { Badge, Button, Card, Empty, Field, inputCls, kc, Modal, PageHead, Stepper, when } from '@/components/ui';

const FLOW = ['Placed', 'Preparing', 'Ready', 'Collected'] as const;

export default function Orders() {
  const { k, me, act } = useKart();
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  if (!me) return null;
  const orders = k.db.orders.filter(o => o.buyerId === me.id);
  return (
    <>
      <PageHead kicker="YOUR ACTIVITY" title="My orders" sub="Track each order from placement to pickup." />
      {orders.length === 0 ? <Empty title="No orders yet">Orders from food, supplies and print appear here.</Empty> : (
        <div className="grid gap-4">
          {orders.map(o => {
            const steps = o.fulfillment === 'delivery' ? [...FLOW.slice(0, 3), 'Out for delivery', FLOW[3]] : [...FLOW];
            const i = steps.indexOf(o.status as (typeof steps)[number]);
            return (
              <Card key={o.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-x5d8369">{o.id} · {when(o.ts)}</div>
                    <h3 className="mt-1 font-display text-base font-bold">{o.title}</h3>
                    <div className="text-[11px] text-muted">{k.store(o.storeId)?.name}{o.window ? ` · ${o.window}` : ''} · {kc(o.amount)} paid from wallet</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={o.status === 'Cancelled' ? 'red' : o.status === 'Ready' ? 'amber' : 'green'}>{o.status}</Badge>
                    {o.status === 'Placed' && <Button size="sm" variant="secondary" onClick={() => { if (confirm('Cancel this order?')) act(kart => kart.cancelOrder(me, o.id), 'Order cancelled'); }}>Cancel</Button>}
                  </div>
                </div>
                {o.handoverCode && o.status !== 'Cancelled' && (
                  <div className="mt-4 rounded-2xl border border-line bg-[#fbfcfa] p-4">
                    <HandoverPass orderId={o.id} code={o.handoverCode} status={o.status}
                      storeName={k.store(o.storeId)?.name} kind={o.kind} fulfillment={o.fulfillment}
                      window={o.window} deliveryDetails={o.deliveryDetails} amount={o.amount} />
                    {o.fulfillment === 'delivery' && o.status === 'Out for delivery' && (
                      <p className="mt-3 text-xs font-bold text-forest-800">Your delivery runner is on the way — hand over the code above to receive the order.</p>
                    )}
                  </div>
                )}
                <AttachmentList files={o.files} />
                {o.status === 'Collected' && (k.db.reviews.find(r => r.kind === 'order' && r.refId === o.id)
                  ? <div className="mt-3 flex items-center gap-2 text-xs"><span className="text-muted">Your review</span><StarRating value={k.db.reviews.find(r => r.kind === 'order' && r.refId === o.id)!.rating} /></div>
                  : <div className="mt-3"><Button size="sm" variant="secondary" onClick={() => { setReviewing(o.id); setStars(5); setComment(''); }}>★ Rate {k.store(o.storeId)?.name}</Button></div>)}
                {o.status !== 'Cancelled' && <div className="mt-4"><Stepper steps={steps.map((s, n) => ({ label: s, state: n < i ? 'done' : n === i ? 'current' : 'todo' }))} /></div>}
              </Card>
            );
          })}
        </div>
      )}
      {reviewing && (
        <Modal title="Rate your order" onClose={() => setReviewing(null)}>
          <form className="grid gap-3" onSubmit={async e => { e.preventDefault(); const r = await act(kart => kart.reviewOrder(me, reviewing, stars, comment), 'Thanks for your review'); if (r.ok) setReviewing(null); }}>
            <StarRating value={stars} onChange={setStars} />
            <Field label="Comment (optional)"><textarea maxLength={300} className={inputCls + ' min-h-20'} value={comment} onChange={e => setComment(e.target.value)} /></Field>
            <Button type="submit">Submit review</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
