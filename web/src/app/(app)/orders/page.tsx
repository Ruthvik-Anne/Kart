'use client';
import { useKart } from '@/mock/StoreProvider';
import { useState } from 'react';
import { StarRating } from '@/components/StarRating';
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
            const i = FLOW.indexOf(o.status as (typeof FLOW)[number]);
            return (
              <Card key={o.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-x5d8369">{o.id} · {when(o.ts)}</div>
                    <h3 className="mt-1 font-display text-base font-bold">{o.title}</h3>
                    <div className="text-[11px] text-muted">{k.store(o.storeId)?.name}{o.window ? ` · ${o.window}` : ''} · {kc(o.amount)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={o.status === 'Cancelled' ? 'red' : o.status === 'Ready' ? 'amber' : 'green'}>{o.status}</Badge>
                    {o.status === 'Placed' && <Button size="sm" variant="secondary" onClick={() => { if (confirm('Cancel this order and refund the KC?')) act(kart => kart.cancelOrder(me, o.id), 'Order cancelled and refunded'); }}>Cancel</Button>}
                  </div>
                </div>
                <AttachmentList files={o.files} />
                {o.status === 'Collected' && (k.db.reviews.find(r => r.kind === 'order' && r.refId === o.id)
                  ? <div className="mt-3 flex items-center gap-2 text-xs"><span className="text-muted">Your review</span><StarRating value={k.db.reviews.find(r => r.kind === 'order' && r.refId === o.id)!.rating} /></div>
                  : <div className="mt-3"><Button size="sm" variant="secondary" onClick={() => { setReviewing(o.id); setStars(5); setComment(''); }}>★ Rate {k.store(o.storeId)?.name}</Button></div>)}
                {o.status !== 'Cancelled' && <div className="mt-4"><Stepper steps={FLOW.map((s, n) => ({ label: s, state: n < i ? 'done' : n === i ? 'current' : 'todo' }))} /></div>}
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
