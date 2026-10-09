'use client';
import { useKart } from '@/mock/StoreProvider';
import { Badge, Button, DataTable, Empty, kc, PageHead, when } from '@/components/ui';

export default function EventApprovals() {
  const { k, me, act } = useKart();
  if (!me) return null;
  const pending = k.db.events.filter(e => e.status === 'pending');
  const decided = k.db.events.filter(e => e.status !== 'pending');
  return (
    <>
      <PageHead kicker="CAMPUS ADMIN" title="Event approvals" sub="Review events submitted by clubs and students before they go live." />
      {pending.length === 0 ? <Empty title="Nothing waiting">Submitted events will appear here.</Empty> : (
        <DataTable head={['Event', 'Host', 'When & where', 'Ticket', 'Action']} rows={pending.map(e => [
          <span key="n"><b>{e.name}</b><br /><span className="text-muted">{e.desc}</span></span>, k.user(e.hostId)?.name, `${when(e.date)} · ${e.place}`, e.price ? kc(e.price) : 'Free',
          <span key="a" className="flex gap-2"><Button size="sm" onClick={() => act(kart => kart.reviewEvent(me, e.id, true), 'Event approved')}>Approve</Button><Button size="sm" variant="secondary" onClick={() => act(kart => kart.reviewEvent(me, e.id, false), 'Event rejected')}>Reject</Button></span>])} />
      )}
      <h2 className="mb-3 mt-8 font-display text-lg font-bold">Decided</h2>
      <DataTable head={['Event', 'Host', 'Outcome']} rows={decided.map(e => [<b key="n">{e.name}</b>, k.user(e.hostId)?.name, <Badge key="s" tone={e.status === 'approved' ? 'green' : 'red'}>{e.status}</Badge>])} />
    </>
  );
}
