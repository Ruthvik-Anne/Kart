'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { AttachmentList } from '@/components/FilePicker';
import { Scanner } from '@/components/Scanner';
import { Badge, Button, Card, Empty, kc, PageHead, Stat, StatGrid, when } from '@/components/ui';

const NEXT: Record<string, string> = { Placed: 'Start preparing', Preparing: 'Mark ready', Ready: 'Mark collected' };

/** Order queue for the signed-in vendor's own store only; used for both canteen/shop orders and print jobs. */
export function VendorOrders({ print }: { print?: boolean }) {
  const { k, me, act } = useKart();
  const [codes, setCodes] = useState<Record<string, string>>({});
  if (!me?.storeId) return null;
  const list = k.db.orders.filter(o => o.storeId === me.storeId && (print ? o.kind === 'print' : o.kind !== 'print'));
  const count = (s: string) => list.filter(o => o.status === s).length;
  return (
    <>
      <PageHead kicker={k.store(me.storeId)?.name ?? 'STORE'} title={print ? 'Print queue' : 'Order queue'} sub="Move each order forward as you work. Customers are notified at every step." />
      <StatGrid>
        <Stat label="New" value={count('Placed')} /><Stat label="Preparing" value={count('Preparing')} />
        <Stat label="Ready" value={count('Ready')} /><Stat label="Done today" value={count('Collected')} />
      </StatGrid>
      {list.length === 0 ? <Empty title="Queue is clear">New orders will show up here.</Empty> : (
        <div className="grid gap-3">
          {list.map(o => {
            const needsRunner = o.status === 'Ready' && o.fulfillment === 'delivery' && !o.runnerId;
            const withRunner = o.status === 'Ready' && o.fulfillment === 'delivery' && !!o.runnerId;
            return (
            <Card key={o.id} data-order-card={o.id} className="!p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#5d8369]">{o.id} · {when(o.ts)} · {k.user(o.buyerId)?.name}</div>
                  <h3 className="mt-1 text-sm font-bold">{o.title}</h3>
                  <div className="text-[11px] text-muted">{kc(o.amount)} paid from wallet{o.window ? ` · ${o.fulfillment === 'delivery' ? 'delivery' : 'pickup'} ${o.window}` : ''}</div>
                  {o.deliveryDetails && <div className="mt-1 text-[11px] font-bold text-forest-800">Delivery: {o.deliveryDetails}</div>}
                  <AttachmentList files={o.files} />
                  {print && o.files?.length ? <div className="mt-2 flex flex-wrap gap-2">{o.files.map(file => <a key={file.id} href={`/api/print/file?id=${encodeURIComponent(file.id)}`} download className="rounded-lg bg-forest-100 px-2 py-1 text-[11px] font-bold text-forest-800 underline">Download {file.name}</a>)}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={o.status === 'Cancelled' ? 'red' : o.status === 'Ready' ? 'amber' : o.status === 'Collected' ? 'gray' : 'green'}>{o.status}</Badge>
                  {NEXT[o.status] && !(o.status === 'Ready' && o.handoverCode) && <Button size="sm" onClick={() => act(kart => kart.advanceOrder(me, o.id), `Order ${o.id} updated`)}>{NEXT[o.status]}</Button>}
                </div>
              </div>
              {needsRunner && (
                <p className="mt-3 border-t border-line pt-3 text-xs font-bold text-forest-800">
                  <Badge tone="amber">Waiting for a delivery runner</Badge>
                </p>
              )}
              {withRunner && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <span className="text-xs font-bold text-forest-800">{k.user(o.runnerId!)?.name} is collecting this order</span>
                  <Button size="sm" onClick={() => act(kart => kart.handoverToRunner(me, o.id), `Order ${o.id} handed to the runner`)}>Hand to runner</Button>
                </div>
              )}
              {o.status === 'Ready' && o.handoverCode && o.fulfillment !== 'delivery' && (
                <form className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4" onSubmit={async e => { e.preventDefault(); const result = await act(kart => kart.verifyHandover(me, o.id, codes[o.id] ?? ''), 'Handover confirmed'); if (result.ok) setCodes(current => ({ ...current, [o.id]: '' })); }}>
                  <label className="text-xs font-bold text-forest-800">Customer handover code
                    <input required maxLength={8} autoComplete="off" data-handover-input value={codes[o.id] ?? ''} onChange={e => setCodes(current => ({ ...current, [o.id]: e.target.value.toUpperCase() }))} className="mt-1 block rounded-xl border border-line px-3 py-2 font-mono uppercase tracking-widest" placeholder="8-character code" />
                  </label>
                  <Button type="submit" size="sm">Confirm handover</Button>
                  <Scanner label="Scan QR pass" onDetect={d => { if (d.code && (!d.orderId || d.orderId === o.id)) setCodes(current => ({ ...current, [o.id]: d.code! })); }} />
                  <span className="text-[11px] text-muted">Scan the customer&apos;s QR pass, or read out the 8-character code.</span>
                </form>
              )}
            </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
