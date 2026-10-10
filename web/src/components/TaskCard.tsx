'use client';
import Link from 'next/link';
import type { Task } from '@/mock/db';
import { useKart } from '@/mock/StoreProvider';
import { Badge, ScoreChip, kc, timeLeft } from '@/components/ui';

export const KIND_LABEL = { urgent: 'Urgent', normal: 'Short-term', long_term: 'Long-term' } as const;
export const KIND_TONE = { urgent: 'amber', normal: 'blue', long_term: 'green' } as const;
export const STATUS_TONE: Record<string, 'green' | 'amber' | 'blue' | 'red' | 'gray'> = {
  open: 'green', bidding: 'green', assigned: 'blue', in_progress: 'blue', review: 'amber', completed: 'gray', cancelled: 'gray', disputed: 'red', resolved: 'gray', draft: 'gray',
};
export const statusLabel = (s: string) => s.replace('_', ' ');

export function TaskCard({ t, showMatch }: { t: Task; showMatch?: boolean }) {
  const { k, me } = useKart();
  const pr = k.priority(t);
  const mine = t.bids.find(b => b.providerId === me?.id);
  const match = showMatch && mine ? k.match(t, mine) : null;
  return (
    <article className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={KIND_TONE[t.kind]}>{t.kind === 'urgent' ? '⚡ ' : ''}{KIND_LABEL[t.kind]}</Badge>
        <Badge tone="gray">{t.category}</Badge>
        <span className="ml-auto"><ScoreChip score={pr.score} label="Priority" parts={pr.parts} /></span>
      </div>
      <h3 className="mt-3 font-display text-base font-bold">
        <Link href={`/tasks/${t.id}`} className="hover:underline">{t.title}</Link>
      </h3>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{t.description}</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-x839389">
        <span>◷ {timeLeft(t.deadline)}</span>
        <span>♙ {me ? k.posterLabel(t, me) : ''}</span>
        <span>◇ {t.bids.length} bid{t.bids.length === 1 ? '' : 's'}</span>
        {t.milestones.length > 1 && <span>⚑ {t.milestones.length} milestones</span>}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-xeef1ed pt-3">
        <strong className="font-display text-lg">{kc(t.budget)}</strong>
        <div className="flex items-center gap-2">
          {match && <ScoreChip score={match.score} label="Your match" parts={match.parts} />}
          <Link href={`/tasks/${t.id}`} className="rounded-xl border border-xdce7dc px-3 py-2 text-[11px] font-extrabold text-forest-800 hover:bg-forest-100">View →</Link>
        </div>
      </div>
    </article>
  );
}
