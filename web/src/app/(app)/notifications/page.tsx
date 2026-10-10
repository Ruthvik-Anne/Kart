'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { Button, Empty, PageHead, Tabs, cx, when } from '@/components/ui';

type Tab = 'all' | 'unread';

export default function Notifications() {
  const { k, me, act } = useKart();
  const [tab, setTab] = useState<Tab>('all');
  if (!me) return null;
  const all = k.notificationsFor(me.id);
  const unread = all.filter(n => !n.read);
  const list = tab === 'unread' ? unread : all;
  return (
    <>
      <PageHead kicker="UPDATES" title="Notifications" sub="Orders, bids, messages, payments and approvals in one place."
        action={<Button variant="secondary" disabled={unread.length === 0} onClick={() => act(kart => kart.markAllRead(me), 'All caught up')}>Mark all as read</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'all', label: `All (${all.length})` }, { id: 'unread', label: `Unread (${unread.length})` }]} />
      {list.length === 0 ? <Empty title={tab === 'unread' ? 'Nothing unread' : 'No notifications yet'}>New activity will show up here.</Empty> : (
        <ul className="grid gap-2">
          {list.map(n => (
            <li key={n.id} className={cx('flex items-center gap-3 rounded-2xl border bg-surface p-4 text-xs', n.read ? 'border-line' : 'border-amber-kart bg-xfffaf0')}>
              <span aria-hidden className={cx('h-2 w-2 flex-none rounded-full', n.read ? 'bg-transparent' : 'bg-amber-kart')} />
              <div className="min-w-0 flex-1"><b className="block">{n.text}</b><span className="text-[10px] text-muted">{when(n.ts)}</span></div>
              {n.href && <Link href={n.href} onClick={() => act(kart => kart.markNotificationRead(me, n.id))} className="rounded-xl border border-brand-200 px-3 py-1.5 font-extrabold text-brand-900 hover:bg-brand-50">Open →</Link>}
              {!n.read && <button className="font-bold text-x55715b underline" onClick={() => act(kart => kart.markNotificationRead(me, n.id))}>Mark read</button>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
