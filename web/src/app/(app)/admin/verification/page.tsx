'use client';
import { useKart } from '@/mock/StoreProvider';
import { Badge, Button, DataTable, Empty, PageHead } from '@/components/ui';

export default function Verification() {
  const { k, me, act } = useKart();
  if (!me) return null;
  const all = k.db.verifications;
  const pending = all.filter(v => v.status === 'pending');
  return (
    <>
      <PageHead kicker="CAMPUS ADMIN" title="Verification queue" sub="Approve students who want to offer services. Approved providers can list services and bid on tasks." />
      {pending.length === 0 ? <Empty title="Queue is clear">New provider requests will appear here.</Empty> : (
        <DataTable head={['Person', 'Request', 'Action']} rows={pending.map(v => [
          <b key="n">{k.user(v.userId)?.name}</b>, `${v.kind} verification`,
          <span key="a" className="flex gap-2">
            <Button size="sm" onClick={() => act(kart => kart.reviewVerification(me, v.id, true), 'Approved')}>Approve</Button>
            <Button size="sm" variant="secondary" onClick={() => act(kart => kart.reviewVerification(me, v.id, false), 'Rejected')}>Reject</Button>
          </span>])} />
      )}
      <h2 className="mb-3 mt-8 font-display text-lg font-bold">Decided</h2>
      <DataTable head={['Person', 'Request', 'Outcome']} rows={all.filter(v => v.status !== 'pending').map(v => [k.user(v.userId)?.name, v.kind, <Badge key="s" tone={v.status === 'approved' ? 'green' : 'red'}>{v.status}</Badge>])} />
    </>
  );
}
