'use client';
import Link from 'next/link';
import { useKart } from '@/mock/StoreProvider';
import { TaskCard } from '@/components/TaskCard';
import { Badge, Card, Empty, kc, PageHead, Stat, StatGrid, when, cx } from '@/components/ui';

const MODULES = [
  { href: '/food',        icon: '🍽️', title: 'Food & Canteen',      sub: 'Order for pickup',         color: 'from-brand-800 to-brand-700' },
  { href: '/xerox',       icon: '🖨️', title: 'Xerox & Print',        sub: 'Documents made easy',      color: 'from-brand-700 to-brand-600' },
  { href: '/shop',        icon: '📐', title: 'Supplies & Merch',      sub: 'Everything for class',     color: 'from-brand-600 to-brand-500' },
  { href: '/tasks',       icon: '⚡', title: 'Task Board',            sub: 'Earn KC and get help',     color: 'from-gold-600 to-gold-500'   },
  { href: '/services',    icon: '✦',  title: 'Student Services',      sub: 'Skills from peers',        color: 'from-brand-900 to-brand-800' },
  { href: '/marketplace', icon: '⇄',  title: 'Buy / Sell / Rent',     sub: 'Campus-to-campus',         color: 'from-gold-700 to-gold-600'   },
  { href: '/events',      icon: '◇',  title: 'Events',                sub: 'See what\'s on',           color: 'from-brand-800 to-brand-700' },
  { href: '/wallet',      icon: '◉',  title: 'KC Wallet',             sub: 'Balance and history',      color: 'from-brand-700 to-brand-600' },
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
  const top = k.db.tasks
    .filter(t => ['open', 'bidding'].includes(t.status) && t.posterId !== me.id)
    .map(t => ({ t, s: k.priority(t).score }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);

  const todayDate = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      {/* Hero greeting */}
      <div className="mb-7 animate-fade-in">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[2px] text-gold-600">
          <span className="h-px w-4 bg-gold-500 inline-block" />
          {todayDate}
        </div>
        <h1 className="mt-1.5 font-display text-[28px] font-bold tracking-tight text-ink">
          {greeting}, {me.name.split(' ')[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-muted">Everything you need on campus, in one place.</p>
      </div>

      {/* Stats row */}
      <StatGrid>
        <Stat
          label="Wallet"
          value={kc(k.balance(me.id))}
          note="Demo credits"
          icon="◉"
          accent
        />
        <Stat label="Active orders" value={active.length} note={`${orders.length} total`} icon="◫" />
        <Stat label="My tasks" value={myTasks.length} note={`${working.length} in progress`} icon="⚡" />
        <Stat
          label="Unread"
          value={k.db.notifications.filter(n => n.userId === me.id && !n.read).length}
          note="notifications"
          icon="🔔"
        />
      </StatGrid>

      {/* Quick access grid */}
      <section aria-label="Quick access" className="mb-8">
        <h2 className="mb-3 font-display text-lg font-bold text-ink">Quick access</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {MODULES.map(({ href, icon, title, sub, color }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md sm:col-span-1 lg:col-span-1"
            >
              <div className={cx(
                'grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br text-2xl shadow-sm',
                'transition-transform duration-200 group-hover:scale-110',
                color,
              )} aria-hidden>
                {icon}
              </div>
              <div>
                <div className="text-[11px] font-bold text-ink leading-tight">{title}</div>
                <div className="text-[9px] text-muted leading-snug mt-0.5">{sub}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Top tasks */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-ink">Top of the task board</h2>
            <Link href="/tasks" className="text-[11px] font-bold text-brand-800 hover:underline">View all →</Link>
          </div>
          {top.length === 0
            ? <Empty icon="⚡" title="No open tasks right now">Check back soon or post your own.</Empty>
            : <div className="grid gap-3">{top.map(({ t }) => <TaskCard key={t.id} t={t} />)}</div>}
        </section>

        {/* Recent activity */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-ink">Recent activity</h2>
            <Link href="/orders" className="text-[11px] font-bold text-brand-800 hover:underline">All orders →</Link>
          </div>

          {orders.length === 0 && working.length === 0
            ? <Empty icon="🌱" title="Nothing yet">Order food, print a document or post a task to get started.</Empty>
            : (
              <Card className="!p-0 overflow-hidden">
                {[
                  ...working.map(t => ({
                    id: t.id,
                    icon: '⚡',
                    title: t.title,
                    sub: `Task · ${t.status.replace('_', ' ')}`,
                    badge: <Badge tone="blue" dot>{t.status.replace('_', ' ')}</Badge>,
                    href: `/tasks/${t.id}`,
                  })),
                  ...orders.slice(0, 5).map(o => ({
                    id: o.id,
                    icon: o.kind === 'print' ? '🖨️' : o.kind === 'food' ? '🍽️' : '📐',
                    title: o.title,
                    sub: `${o.id} · ${when(o.ts)}`,
                    badge: <Badge tone={o.status === 'Cancelled' ? 'red' : o.status === 'Ready' ? 'amber' : 'green'} dot>{o.status}</Badge>,
                    href: '/orders',
                  })),
                ].map((r, i) => (
                  <Link
                    key={r.id}
                    href={r.href}
                    className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 transition-colors hover:bg-surface-2"
                  >
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-brand-50 text-lg" aria-hidden>{r.icon}</span>
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-xs text-ink">{r.title}</b>
                      <span className="text-[10px] text-muted">{r.sub}</span>
                    </div>
                    {r.badge}
                  </Link>
                ))}
              </Card>
            )}
        </section>
      </div>
    </>
  );
}
