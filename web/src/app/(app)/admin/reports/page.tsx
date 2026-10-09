'use client';
import { useKart } from '@/mock/StoreProvider';
import { PageHead, Stat, StatGrid } from '@/components/ui';

export default function Reports() {
  const { k } = useKart();
  const students = k.db.users.filter(u => u.roles.includes('student'));
  const t = k.db.tasks;
  return (
    <>
      <PageHead kicker="CAMPUS ADMIN" title="Campus reports" sub="Activity counts only. Individual wallets and private messages are not visible here." />
      <StatGrid>
        <Stat label="Students" value={students.length} note={`${students.filter(s => s.providerEnabled).length} verified providers`} />
        <Stat label="Stores" value={k.db.stores.length} />
        <Stat label="Orders" value={k.db.orders.length} />
        <Stat label="Tasks" value={t.length} note={`${t.filter(x => x.status === 'completed').length} completed`} />
      </StatGrid>
    </>
  );
}
