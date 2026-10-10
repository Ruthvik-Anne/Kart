'use client';
import Link from 'next/link';
import { useKart } from '@/mock/StoreProvider';
import { TaskCard } from '@/components/TaskCard';
import { Badge, Card, Empty, kc, PageHead, Stat, StatGrid, when } from '@/components/ui';

const MODULES = [
  ['/food', '🍽️', 'Food & Canteen', 'Order for pickup'],
  ['/xerox', '🖨️', 'Xerox & Print', 'Documents made easy'],
  ['/shop', '📐', 'Supplies & Merch', 'Everything for class'],
  ['/tasks', '⚡', 'Task Board', 'Earn and get help'],
  ['/services', '✦', 'Student Services', 'Skills from peers'],
  ['/marketplace', '⇄', 'Buy / Sell / Rent', 'Campus-to-campus'],
  ['/events', '◇', 'Events', 'See what’s on'],
  ['/wallet', '◉', 'KC Wallet', 'Balance and history'],
] as const;

export default function Dashboard() {
  const { k, me } = useKart();
  if (!me) return null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const orders = k.db.orders.filter(o => o.buyerId === me.id);
  const active = orders.filter(o => ['Placed', 'Preparing', 'Ready'].includes(o.status));
  const myTasks = k.db.tasks.filter(t => t.posterId === me.id || t.assigneeId === me.id);
  const working = k.db.tasks.filter(t => t.assigneeId === me.id && ['assigned', 'in_progress', 'review'].includes(t.status));
  const top = k.db.tasks.filter(t => ['open', 'bidding'].includes(t.status) && t.posterId !== me.id)
    .map(t => ({ t, s: k.priority(t).score })).sort((a, b) => b.s - a.s).slice(0, 2);

  return (
    <>
      <PageHead kicker={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} title={`${greeting}, ${me.name.split(' ')[0]} 👋`} sub="Everything you need on campus, in one place." />
      <StatGrid>
        <Stat label="Wallet" value={kc(k.balance(me.id))} note="Demo credits" />
        <Stat label="Active orders" value={active.length} note={`${orders.length} in total`} />
        <Stat label="My tasks" value={myTasks.length} note={`${working.length} to deliver`} />
        <Stat label="Notifications" value={k.db.notifications.filter(n => n.userId === me.id).length} />
      </StatGrid>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {MODULES.map(([href, icon, title, sub]) => (
          <Link key={href} href={href} className="rounded-2xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-forest-100 text-xl" aria-hidden>{icon}</div>
            <strong className="block font-display text-[15px]">{title}</strong><span className="text-[11px] text-muted">{sub} →</span>
          </Link>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-lg font-bold">Top of the task board</h2>
          <div className="grid gap-3">{top.map(({ t }) => <TaskCard key={t.id} t={t} />)}</div>
        </div>
        <div>
          <h2 className="mb-3 font-display text-lg font-bold">Your recent activity</h2>
          {orders.length === 0 && working.length === 0 ? <Empty title="Nothing yet">Order food, print a document or post a task to get started.</Empty> : (
            <Card className="!p-2">
              {[...working.map(t => ({ id: t.id, icon: '⚡', title: t.title, sub: `Task · ${t.status.replace('_', ' ')}`, end: <Link className="text-[11px] font-extrabold text-forest-800" href={`/tasks/${t.id}`}>Open →</Link> })),
                ...orders.slice(0, 4).map(o => ({ id: o.id, icon: o.kind === 'print' ? '🖨️' : o.kind === 'food' ? '🍽️' : '📐', title: o.title, sub: `${o.id} · ${when(o.ts)}`, end: <Badge tone={o.status === 'Cancelled' ? 'red' : 'green'}>{o.status}</Badge> }))]
                .map(r => (
                  <div key={r.id} className="flex items-center gap-3 border-b border-xeff2ed p-3 last:border-0">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-xf0f5ec" aria-hidden>{r.icon}</span>
                    <div className="min-w-0 flex-1"><b className="block truncate text-xs">{r.title}</b><span className="text-[10px] text-muted">{r.sub}</span></div>{r.end}
                  </div>
                ))}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
