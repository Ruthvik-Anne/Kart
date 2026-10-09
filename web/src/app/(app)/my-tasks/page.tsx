'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { TaskCard } from '@/components/TaskCard';
import { Button, Empty, PageHead, Tabs } from '@/components/ui';

type Tab = 'posted' | 'working' | 'bids' | 'history';

export default function MyTasks() {
  const { k, me } = useKart();
  const [tab, setTab] = useState<Tab>('posted');
  if (!me) return null;
  const closed = ['completed', 'cancelled', 'resolved'];
  const all = k.db.tasks;
  const lists: Record<Tab, typeof all> = {
    posted: all.filter(t => t.posterId === me.id && !closed.includes(t.status)),
    working: all.filter(t => t.assigneeId === me.id && !closed.includes(t.status)),
    bids: all.filter(t => !t.assigneeId && t.bids.some(b => b.providerId === me.id) && ['open', 'bidding'].includes(t.status)),
    history: all.filter(t => (t.posterId === me.id || t.assigneeId === me.id) && closed.includes(t.status)),
  };
  const list = lists[tab];
  return (
    <>
      <PageHead kicker="MY TASKS" title="Everything you posted or took on" action={<Link href="/tasks/new"><Button>+ Post a task</Button></Link>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'posted', label: `Posted (${lists.posted.length})` },
        { id: 'working', label: `Working on (${lists.working.length})` },
        { id: 'bids', label: `My bids (${lists.bids.length})` },
        { id: 'history', label: `History (${lists.history.length})` },
      ]} />
      {list.length === 0 ? <Empty title="Nothing here yet">Tasks you post, bid on or finish will show up here.</Empty> : (
        <div className="grid gap-4 lg:grid-cols-2">{list.map(t => <TaskCard key={t.id} t={t} showMatch={tab === 'bids'} />)}</div>
      )}
    </>
  );
}
