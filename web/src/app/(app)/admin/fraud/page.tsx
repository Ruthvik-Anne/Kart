'use client';
import { useKart } from '@/mock/StoreProvider';
import { Badge, DataTable, Empty, Notice, PageHead } from '@/components/ui';

interface Alert { sev: 'high' | 'medium'; who: string; why: string }

export default function Fraud() {
  const { k } = useKart();
  const alerts: Alert[] = [];
  const hour = 3_600_000;
  for (const u of k.db.users) {
    const mine = k.ledger.entries.filter(e => e.postings.some(p => p.account === `USER_WALLET:${u.id}`));
    const recent = mine.filter(e => Date.now() - e.ts < hour);
    if (recent.length >= 15) alerts.push({ sev: 'medium', who: u.name, why: `${recent.length} wallet movements in the last hour` });
    const cancelled = k.db.tasks.filter(t => t.posterId === u.id && t.status === 'cancelled').length;
    if (cancelled >= 3) alerts.push({ sev: 'medium', who: u.name, why: `${cancelled} cancelled tasks` });
  }
  // Same two people repeatedly trading tasks can indicate fee/rating farming.
  const pairs = new Map<string, number>();
  for (const t of k.db.tasks.filter(x => x.status === 'completed' && x.assigneeId)) pairs.set(`${t.posterId}>${t.assigneeId}`, (pairs.get(`${t.posterId}>${t.assigneeId}`) ?? 0) + 1);
  for (const [pair, n] of pairs) if (n >= 3) { const [a, b] = pair.split('>'); alerts.push({ sev: 'high', who: `${k.user(a)?.name} → ${k.user(b)?.name}`, why: `${n} completed tasks between the same pair (possible collusion)` }); }
  for (const t of k.db.tasks.filter(x => x.status === 'disputed')) alerts.push({ sev: 'high', who: k.user(t.posterId)?.name ?? '', why: `Open dispute on "${t.title}"` });
  if (!k.ledger.trialBalance().balanced) alerts.unshift({ sev: 'high', who: 'Ledger', why: 'Trial balance does not net to zero' });

  return (
    <>
      <PageHead kicker="PLATFORM ADMIN" title="Fraud alerts" sub="Simple rule-based monitors. Real scoring and case management come with the backend." />
      <Notice>Rules today: heavy wallet activity in an hour, repeated cancellations, the same pair trading tasks repeatedly, open disputes, and an unbalanced ledger.</Notice>
      {alerts.length === 0 ? <Empty title="No alerts">Nothing unusual right now.</Empty> : (
        <DataTable head={['Severity', 'Who', 'Why']} rows={alerts.map(a => [<Badge key="s" tone={a.sev === 'high' ? 'red' : 'amber'}>{a.sev}</Badge>, <b key="w">{a.who}</b>, a.why])} />
      )}
    </>
  );
}
