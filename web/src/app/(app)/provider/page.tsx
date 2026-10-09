'use client';
import Link from 'next/link';
import { useKart } from '@/mock/StoreProvider';
import { TaskCard } from '@/components/TaskCard';
import { StarRating } from '@/components/StarRating';
import { Badge, Card, DataTable, Empty, kc, PageHead, Stat, StatGrid, when } from '@/components/ui';

export default function ProviderHub() {
  const { k, me } = useKart();
  if (!me) return null;
  const profile = k.profile(me.id);
  const active = k.db.tasks.filter(t => t.assigneeId === me.id && !['completed', 'cancelled', 'resolved'].includes(t.status));
  const pendingBids = k.db.tasks.filter(t => !t.assigneeId && ['open', 'bidding'].includes(t.status) && t.bids.some(b => b.providerId === me.id));
  const payouts = k.ledger.entries.filter(e => e.type === 'escrow_release' && e.postings.some(p => p.account === `USER_WALLET:${me.id}`)).reverse();
  const earned = payouts.reduce((a, e) => a + e.postings.filter(p => p.account === `USER_WALLET:${me.id}`).reduce((s, p) => s + p.amount, 0), 0);
  const inEscrow = active.reduce((a, t) => a + k.ledger.balance(`TASK_ESCROW:${t.id}`), 0);
  const mine = k.db.services.filter(s => s.providerId === me.id);

  return (
    <>
      <PageHead kicker="PROVIDER HUB" title="Your work and earnings" sub="Jobs in progress, pending bids, payouts and reputation." />
      <StatGrid>
        <Stat label="Total earned" value={kc(earned)} note="After platform fees" />
        <Stat label="Coming from escrow" value={kc(inEscrow)} note="Released as milestones are approved" />
        <Stat label="Rating" value={profile ? `★ ${profile.rating.toFixed(1)}` : '—'} note={profile ? `${profile.ratingCount} reviews` : 'No reviews yet'} />
        <Stat label="Completed jobs" value={Object.values(profile?.completed ?? {}).reduce((a, b) => a + b, 0)} />
      </StatGrid>
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-lg font-bold">Active jobs</h2>
          {active.length === 0 ? <Empty title="No active jobs">Win a bid on the <Link className="font-bold underline" href="/tasks">task board</Link> to get started.</Empty> : <div className="grid gap-3">{active.map(t => <TaskCard key={t.id} t={t} />)}</div>}
        </div>
        <div>
          <h2 className="mb-3 font-display text-lg font-bold">Waiting on a decision</h2>
          {pendingBids.length === 0 ? <Empty title="No pending bids" /> : <div className="grid gap-3">{pendingBids.map(t => <TaskCard key={t.id} t={t} showMatch />)}</div>}
        </div>
      </div>
      <h2 className="mb-3 mt-8 font-display text-lg font-bold">Your services</h2>
      {mine.length === 0 ? <Card className="text-xs text-muted">You haven&apos;t listed a service yet. Add one from <Link className="font-bold underline" href="/services">Student Services</Link>.</Card> : (
        <DataTable head={['Service', 'Price']} rows={mine.map(s => [<b key="n">{s.name}</b>, `${kc(s.price)} / ${s.unit}`])} />
      )}
      <h2 className="mb-3 mt-8 font-display text-lg font-bold">Reviews from posters</h2>
      {k.reviewsFor(me.id, 'provider').length === 0 ? <Card className="text-xs text-muted">No reviews yet. Posters can rate you after a task is completed.</Card> : (
        <div className="grid gap-2">{k.reviewsFor(me.id, 'provider').slice(0, 6).map(r => (
          <Card key={r.id} className="!p-4 text-xs"><div className="flex items-center justify-between"><b>{k.user(r.fromId)?.name}</b><StarRating value={r.rating} /></div>{r.comment && <p className="mt-1 text-[#4c6354]">{r.comment}</p>}<div className="mt-1 text-[10px] text-muted">{k.task(r.refId)?.title} · {when(r.ts)}</div></Card>))}</div>
      )}
      <h2 className="mb-3 mt-8 font-display text-lg font-bold">Payout history</h2>
      {payouts.length === 0 ? <Card className="text-xs text-muted">Payouts appear when a poster approves a milestone.</Card> : (
        <DataTable head={['Entry', 'For', 'Date', 'Received']} rows={payouts.map(e => [<code key="i" className="text-[11px]">{e.id}</code>, e.memo, when(e.ts), <Badge key="a">{kc(e.postings.find(p => p.account === `USER_WALLET:${me.id}`)!.amount)}</Badge>])} />
      )}
    </>
  );
}
