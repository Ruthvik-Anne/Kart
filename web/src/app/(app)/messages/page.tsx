'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { ChatThread } from '@/components/ChatThread';
import { Card, Empty, PageHead, cx, when } from '@/components/ui';

export default function Messages() {
  const { k, me } = useKart();
  const [sel, setSel] = useState<string | null>(null);
  if (!me) return null;
  const keys = k.threadKeysFor(me).map(key => {
    const [taskId, bidderId] = key.split(':');
    const t = k.task(taskId)!;
    const msgs = k.db.messages.filter(m => m.threadKey === key);
    const otherId = me.id === t.posterId ? bidderId : t.posterId;
    const other = me.id === t.posterId || !t.anonymous ? k.user(otherId)?.name ?? 'Unknown' : 'Anonymous student';
    return { key, t, other, last: msgs[msgs.length - 1], closed: !!t.assigneeId && t.assigneeId !== bidderId };
  }).sort((a, b) => (b.last?.ts ?? 0) - (a.last?.ts ?? 0));
  const current = keys.find(x => x.key === sel) ?? keys[0];

  return (
    <>
      <PageHead kicker="MESSAGES" title="Task conversations" sub="Private threads between a poster and each bidder, kept with the task." />
      {keys.length === 0 ? <Empty title="No conversations yet">Bid on a task, or wait for bids on yours, to start chatting.</Empty> : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="grid content-start gap-2" role="list">
            {keys.map(x => (
              <button key={x.key} role="listitem" onClick={() => setSel(x.key)}
                className={cx('rounded-xl border p-3 text-left text-xs', current?.key === x.key ? 'border-forest-800 bg-forest-100' : 'border-line bg-white')}>
                <b className="block truncate">{x.t.title}</b>
                <span className="text-muted">{x.other}{x.closed ? ' · closed' : ''}</span>
                <span className="mt-1 block truncate text-[11px] text-[#4c6354]">{x.last ? x.last.body : 'No messages yet'}</span>
                {x.last && <span className="text-[9px] text-muted">{when(x.last.ts)}</span>}
              </button>
            ))}
          </div>
          {current && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <div><b className="font-display text-base">{current.other}</b><div className="text-[11px] text-muted">{current.t.title}</div></div>
                <Link className="text-[11px] font-extrabold text-forest-800" href={`/tasks/${current.t.id}`}>Open task →</Link>
              </div>
              <ChatThread key={current.key} threadKey={current.key} otherName={current.other} canNegotiate={['open', 'bidding'].includes(current.t.status) && !current.closed && !k.isLocked(current.t)} readOnly={current.closed || ['completed', 'cancelled', 'resolved'].includes(current.t.status)} />
            </Card>
          )}
        </div>
      )}
    </>
  );
}
