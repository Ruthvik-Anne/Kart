'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { TaskCard, KIND_LABEL } from '@/components/TaskCard';
import { Button, Can, Empty, PageHead, Stat, StatGrid, Tabs, inputCls, kc, cx } from '@/components/ui';
import type { TaskKind } from '@/lib/scoring';

const CATEGORIES = ['All', 'Pickup', 'Delivery', 'Digital', 'Academic help', 'Other'];

export default function TaskBoard() {
  const { k, me } = useKart();
  const [lane, setLane] = useState<TaskKind>('urgent');
  const [category, setCategory] = useState('All');
  const [minBudget, setMinBudget] = useState('');
  const [providerOnly, setProviderOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

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
  const escrowHeld = k.db.tasks
    .filter(t => ['assigned', 'in_progress', 'review'].includes(t.status))
    .reduce((a, t) => a + (t.acceptedAmount ?? 0), 0);

  const hasFilters = category !== 'All' || minBudget || providerOnly;

  return (
    <>
      <PageHead
        kicker="TASK BOARD"
        title="Get help. Earn KC."
        sub="Tasks ranked by priority: deadline pressure, budget, poster trust and waiting time."
        action={
          <Can perm="task:post">
            <Link href="/tasks/new">
              <Button icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
              }>
                Post a task
              </Button>
            </Link>
          </Can>
        }
      />

      <StatGrid>
        <Stat label="Open tasks"   value={open.length}       note="From other students" icon="📋" />
        <Stat label="Urgent now"   value={count('urgent')}   note="Due within 6 hours"  icon="⚡" />
        <Stat label="Long-term"    value={count('long_term')} note="Milestone based"     icon="📅" />
        <Stat label="In escrow"    value={kc(escrowHeld)}    note="Across campus"       icon="🔒" />
      </StatGrid>

      {/* Lane tabs */}
      <Tabs
        value={lane}
        onChange={setLane}
        tabs={[
          { id: 'urgent',    label: `⚡ Urgent`,    count: count('urgent') },
          { id: 'normal',    label: `⏱ Short-term`, count: count('normal') },
          { id: 'long_term', label: `📅 Long-term`,  count: count('long_term') },
        ]}
      />

      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowFilters(f => !f)}
          className={cx(
            'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors',
            (showFilters || hasFilters)
              ? 'border-brand-700 bg-brand-50 text-brand-900'
              : 'border-line bg-surface text-ink hover:bg-surface-2',
          )}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
          </svg>
          Filters
          {hasFilters && <span className="ml-0.5 rounded-full bg-brand-900 px-1.5 text-[9px] text-cream-50">!</span>}
        </button>

        {showFilters && (
          <>
            <select
              aria-label="Category filter"
              className={`${inputCls} max-w-[11rem]`}
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <input
              aria-label="Minimum budget in KC"
              type="number"
              min={0}
              className={`${inputCls} max-w-[9rem]`}
              placeholder="Min budget KC"
              value={minBudget}
              onChange={e => setMinBudget(e.target.value)}
            />
            {me?.providerEnabled && (
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-bold hover:bg-surface-2 transition-colors">
                <input type="checkbox" checked={providerOnly} onChange={e => setProviderOnly(e.target.checked)} className="accent-brand-700" />
                My categories only
              </label>
            )}
            {hasFilters && (
              <button
                onClick={() => { setCategory('All'); setMinBudget(''); setProviderOnly(false); }}
                className="text-xs font-bold text-muted underline hover:text-ink"
              >
                Clear filters
              </button>
            )}
          </>
        )}

        <span className="ml-auto text-[11px] text-muted">{ranked.length} task{ranked.length !== 1 ? 's' : ''} found</span>
      </div>

      {ranked.length === 0
        ? (
          <Empty icon="📋" title="No tasks in this lane">
            {hasFilters ? 'Try loosening your filters.' : 'Check back soon or be the first to post.'}
          </Empty>
        )
        : (
          <div className="grid gap-4 lg:grid-cols-2">
            {ranked.map(({ t }) => <TaskCard key={t.id} t={t} />)}
          </div>
        )}
    </>
  );
}
