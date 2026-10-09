'use client';
import Link from 'next/link';
import { useKart } from '@/mock/StoreProvider';
import { Badge, Card, Empty, kc, PageHead } from '@/components/ui';

export default function Disputes() {
  const { k } = useKart();
  const open = k.db.tasks.filter(t => t.status === 'disputed');
  const resolved = k.db.tasks.filter(t => t.status === 'resolved');
  return (
    <>
      <PageHead kicker="PLATFORM ADMIN" title="Disputes" sub="Review evidence, then refund the poster or release to the provider. Every conversation you read is logged." />
      {open.length === 0 ? <Empty title="No open disputes" /> : (
        <div className="grid gap-3">
          {open.map(t => (
            <Card key={t.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <b className="font-display text-base">{t.title}</b>
                  <div className="text-[11px] text-muted">Poster {k.user(t.posterId)?.name} · Provider {k.user(t.assigneeId ?? '')?.name} · opened by {k.user(t.disputedBy ?? '')?.name}</div>
                  <p className="mt-2 text-xs">&ldquo;{t.disputeReason}&rdquo;</p>
                </div>
                <div className="text-right"><Badge tone="red">{kc(k.ledger.balance(`TASK_ESCROW:${t.id}`))} frozen</Badge><br />
                  <Link className="mt-2 inline-block text-[11px] font-extrabold text-forest-800" href={`/tasks/${t.id}`}>Review & decide →</Link></div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <h2 className="mb-3 mt-8 font-display text-lg font-bold">Resolved</h2>
      <p className="text-xs text-muted">{resolved.length ? resolved.map(t => t.title).join(' · ') : 'None yet.'}</p>
      <h2 className="mb-3 mt-8 font-display text-lg font-bold">Admin access log</h2>
      <Card className="!p-3 text-xs">
        {k.db.audit.length === 0 ? <span className="text-muted">No admin actions yet.</span> : k.db.audit.slice(0, 8).map(a => <div key={a.id} className="border-b border-xeff2ed py-1.5 last:border-0"><b>{k.user(a.actorId)?.name}</b> · {a.text}</div>)}
      </Card>
    </>
  );
}
