'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { TaskCard, KIND_LABEL } from '@/components/TaskCard';
import { Button, Can, Empty, PageHead, Stat, StatGrid, Tabs, inputCls, kc } from '@/components/ui';
import type { TaskKind } from '@/lib/scoring';

const CATEGORIES = ['All', 'Pickup', 'Delivery', 'Digital', 'Academic help', 'Other'];

export default function TaskBoard() {
  const { k, me } = useKart();
  const [lane, setLane] = useState<TaskKind>('urgent');
  const [category, setCategory] = useState('All');
  const [minBudget, setMinBudget] = useState('');
  const [providerOnly, setProviderOnly] = useState(false);

  const open = k.db.tasks.filter(t => ['open', 'bidding'].includes(t.status) && t.posterId !== me?.id);
  const ranked = useMemo(() => {
    const min = Number(minBudget) || 0;
    return open
      .filter(t => t.kind === lane && (category === 'All' || t.category === category) && t.budget >= min)
      .filter(t => !providerOnly || (k.profile(me?.id ?? '')?.completed[t.category] ?? 0) > 0)
      .map(t => ({ t, score: k.priority(t).score }))
      .sort((a, b) => b.score - a.score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k.db.tasks, lane, category, minBudget, providerOnly, me?.id]);

  const count = (kind: TaskKind) => open.filter(t => t.kind === kind).length;
  const escrowHeld = k.db.tasks.filter(t => ['assigned', 'in_progress', 'review'].includes(t.status)).reduce((a, t) => a + (t.acceptedAmount ?? 0), 0);

  return (
    <>
      <PageHead kicker="TASK BOARD" title="Get help. Earn KC." sub="Ranked by a priority score: deadline pressure, budget, poster trust and waiting time."
        action={<Can perm="task:post"><Link href="/tasks/new"><Button>+ Post a task</Button></Link></Can>} />
      <StatGrid>
        <Stat label="Open tasks" value={open.length} note="From other students" />
        <Stat label="Urgent now" value={count('urgent')} note="Due within 6 hours" />
        <Stat label="Long-term" value={count('long_term')} note="Milestone based" />
        <Stat label="Held in escrow" value={kc(escrowHeld)} note="Across campus" />
      </StatGrid>
      <Tabs value={lane} onChange={setLane} tabs={[
        { id: 'urgent', label: `⚡ ${KIND_LABEL.urgent} (${count('urgent')})` },
        { id: 'normal', label: `${KIND_LABEL.normal} (${count('normal')})` },
        { id: 'long_term', label: `${KIND_LABEL.long_term} (${count('long_term')})` },
      ]} />
      <div className="mb-5 flex flex-wrap items-center gap-3 text-xs">
        <select aria-label="Category" className={`${inputCls} max-w-[11rem]`} value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
        <input aria-label="Minimum budget in KC" type="number" min={0} className={`${inputCls} max-w-[9rem]`} placeholder="Min budget KC" value={minBudget} onChange={e => setMinBudget(e.target.value)} />
        {me?.providerEnabled && <label className="flex items-center gap-2 font-bold text-[#55715b]"><input type="checkbox" checked={providerOnly} onChange={e => setProviderOnly(e.target.checked)} /> Only categories I&apos;ve worked in</label>}
        <span className="ml-auto text-[11px] text-muted">Sorted by priority, highest first</span>
      </div>
      {ranked.length === 0 ? <Empty title="No tasks in this lane">Try another lane or loosen the filters.</Empty> : (
        <div className="grid gap-4 lg:grid-cols-2">{ranked.map(({ t }) => <TaskCard key={t.id} t={t} />)}</div>
      )}
    </>
  );
}
