'use client';
import Link from 'next/link';
import type { Task } from '@/mock/db';
import { useKart } from '@/mock/StoreProvider';
import { Badge, ScoreChip, kc, timeLeft, cx } from '@/components/ui';

export const KIND_LABEL = { urgent: 'Urgent', normal: 'Short-term', long_term: 'Long-term' } as const;
export const KIND_TONE  = { urgent: 'amber', normal: 'blue', long_term: 'green' } as const;
export const STATUS_TONE: Record<string, 'green' | 'amber' | 'blue' | 'red' | 'gray'> = {
  open: 'green', bidding: 'green', assigned: 'blue', in_progress: 'blue',
  review: 'amber', completed: 'gray', cancelled: 'gray', disputed: 'red', resolved: 'gray', draft: 'gray',
};
export const statusLabel = (s: string) => s.replace('_', ' ');

const KIND_ICON = { urgent: '⚡', normal: '⏱', long_term: '📅' } as const;

export function TaskCard({ t, showMatch }: { t: Task; showMatch?: boolean }) {
  const { k, me } = useKart();
  const pr = k.priority(t);
  const mine = t.bids.find(b => b.providerId === me?.id);
  const match = showMatch && mine ? k.match(t, mine) : null;
  const overdue = t.deadline < Date.now();
  const tl = timeLeft(t.deadline);

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-line bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-brand-200">
      {/* Urgency accent bar */}
      {t.kind === 'urgent' && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gold-500 rounded-l-2xl" />
      )}

      <div className={cx('p-5', t.kind === 'urgent' && 'pl-6')}>
        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={KIND_TONE[t.kind]}>
            <span aria-hidden>{KIND_ICON[t.kind]}</span> {KIND_LABEL[t.kind]}
          </Badge>
          <Badge tone="gray">{t.category}</Badge>
          <span className="ml-auto">
            <ScoreChip score={pr.score} label="Priority" parts={pr.parts} />
          </span>
        </div>

        {/* Title */}
        <h3 className="mt-3 font-display text-[15px] font-bold leading-snug">
          <Link href={`/tasks/${t.id}`} className="hover:text-brand-800 transition-colors">{t.title}</Link>
        </h3>

        {/* Description */}
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{t.description}</p>

        {/* Meta row */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
          <span className={cx('flex items-center gap-1', overdue ? 'font-bold text-danger-700' : 'text-muted')}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
            </svg>
            {tl}
          </span>
          {me && (
            <span className="flex items-center gap-1 text-muted">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              {k.posterLabel(t, me)}
            </span>
          )}
          <span className="flex items-center gap-1 text-muted">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {t.bids.length} bid{t.bids.length !== 1 ? 's' : ''}
          </span>
          {t.milestones.length > 1 && (
            <span className="flex items-center gap-1 text-muted">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" />
              </svg>
              {t.milestones.length} milestones
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
          <strong className="font-display text-xl text-ink">{kc(t.budget)}</strong>
          <div className="flex items-center gap-2">
            {match && <ScoreChip score={match.score} label="Match" parts={match.parts} />}
            <Link
              href={`/tasks/${t.id}`}
              className="flex items-center gap-1 rounded-xl bg-brand-50 border border-brand-100 px-3 py-2 text-[11px] font-bold text-brand-900 transition-all hover:bg-brand-900 hover:text-cream-50 hover:border-brand-900"
            >
              View
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
