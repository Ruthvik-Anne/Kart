'use client';
import { useKart } from '@/mock/StoreProvider';
import { AttachmentList } from '@/components/FilePicker';
import { Badge, Button, Card, Empty, kc, PageHead, Stat, StatGrid, when } from '@/components/ui';

const NEXT: Record<string, string> = { Placed: 'Start preparing', Preparing: 'Mark ready', Ready: 'Mark collected' };

/** Order queue for the signed-in vendor's own store only; used for both canteen/shop orders and print jobs. */
export function VendorOrders({ print }: { print?: boolean }) {
  const { k, me, act } = useKart();
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
          {list.map(o => (
            <Card key={o.id} className="!p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-brand-700">{o.id} · {when(o.ts)} · {k.user(o.buyerId)?.name}</div>
                  <h3 className="mt-1 text-sm font-bold">{o.title}</h3>
                  <div className="text-[11px] text-muted">{kc(o.amount)}{o.window ? ` · pickup ${o.window}` : ''}</div>
                  <AttachmentList files={o.files} />
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={o.status === 'Cancelled' ? 'red' : o.status === 'Ready' ? 'amber' : o.status === 'Collected' ? 'gray' : 'green'}>{o.status}</Badge>
                  {NEXT[o.status] && <Button size="sm" onClick={() => act(kart => kart.advanceOrder(me, o.id), `Order ${o.id} updated`)}>{NEXT[o.status]}</Button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
