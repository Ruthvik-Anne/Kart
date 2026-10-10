'use client';
import Link from 'next/link';
import { useKart } from '@/mock/StoreProvider';
import { TaskCard } from '@/components/TaskCard';
import { CampusHeader } from '@/components/CampusHeader';
import { HandoverPass } from '@/components/HandoverPass';
import { Badge, Card, Empty, kc, PageHead, Stat, StatGrid, when } from '@/components/ui';

const MODULES = [
  ['/food', '🍽️', 'Food & Canteen', 'Order for pickup or delivery'],
  ['/xerox', '🖨️', 'Xerox & Print', 'Upload docs, choose paper & binding'],
  ['/shop', '📐', 'Supplies & Merch', 'Everything for class'],
  ['/tasks', '⚡', 'Task Board', 'Earn and get help'],
  ['/delivery', '🛵', 'Delivery jobs', 'Carry orders, earn credits'],
  ['/services', '✦', 'Student Services', 'Skills from peers'],
  ['/marketplace', '⇄', 'Buy / Sell / Rent', 'Campus-to-campus'],
  ['/events', '◇', 'Events', 'See what’s on'],
  ['/wallet', '◉', 'KC Wallet', 'Balance and history'],
  ['/orders', '◫', 'My Orders', 'Passes and handover codes'],
] as const;

export default function Dashboard() {
  const { k, me } = useKart();
  if (!me) return null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const orders = k.db.orders.filter(o => o.buyerId === me.id);
  const active = orders.filter(o => ['Placed', 'Preparing', 'Ready', 'Out for delivery'].includes(o.status));
  const ready = orders.filter(o => o.status === 'Ready' && o.handoverCode);
  const myTasks = k.db.tasks.filter(t => t.posterId === me.id || t.assigneeId === me.id);
  const working = k.db.tasks.filter(t => t.assigneeId === me.id && ['assigned', 'in_progress', 'review'].includes(t.status));
  const top = k.db.tasks.filter(t => ['open', 'bidding'].includes(t.status) && t.posterId !== me.id)
    .map(t => ({ t, s: k.priority(t).score })).sort((a, b) => b.s - a.s).slice(0, 2);

  return (
    <>
      <CampusHeader
        campusId={me.campusId}
        kicker={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        role="Student"
        title={`${greeting}, ${me.name.split(' ')[0]} 👋`}
        sub="Everything you need on campus — food, print, tasks and deliveries — in one place."
        actions={
          <>
            <Link href="/food" className="rounded-xl bg-[#eeac54] px-4 py-2.5 text-xs font-extrabold text-forest-950 hover:brightness-95">Order food</Link>
            <Link href="/xerox" className="rounded-xl border border-white/35 bg-white/10 px-4 py-2.5 text-xs font-extrabold text-white backdrop-blur hover:bg-white/20">Print documents</Link>
          </>
        }
      />
      <StatGrid>
        <Stat label="Wallet" value={kc(k.balance(me.id))} note="Demo credits" />
        <Stat label="Active orders" value={active.length} note={`${orders.length} in total`} />
        <Stat label="My tasks" value={myTasks.length} note={`${working.length} to deliver`} />
        <Stat label="Notifications" value={k.db.notifications.filter(n => n.userId === me.id).length} />
      </StatGrid>

      {ready.length > 0 && (
        <div className="mb-8">
          <PageHead kicker="READY NOW" title="Your handover passes" sub="Show the QR code or read out the code at the counter — your order is already paid from your wallet." />
          <div className="grid gap-4">
            {ready.map(o => (
              <Card key={o.id} className="!p-4">
                <HandoverPass orderId={o.id} code={o.handoverCode!} status={o.status} storeName={k.store(o.storeId)?.name}
                  kind={o.kind} fulfillment={o.fulfillment} window={o.window} deliveryDetails={o.deliveryDetails} amount={o.amount} />
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {MODULES.map(([href, icon, title, sub]) => (
          <Link key={href} href={href} className="group rounded-2xl border border-line bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#cfe0d2] hover:shadow-lg">
            <div className="mb-2.5 grid h-10 w-10 place-items-center rounded-xl bg-forest-100 text-xl transition group-hover:bg-[#eeac54]" aria-hidden>{icon}</div>
            <strong className="block font-display text-sm leading-tight">{title}</strong>
            <span className="mt-0.5 block text-[10px] leading-snug text-muted">{sub}</span>
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
                ...orders.slice(0, 4).map(o => ({ id: o.id, icon: o.kind === 'print' ? '🖨️' : o.kind === 'food' ? '🍽️' : '📐', title: o.title, sub: `${o.id} · ${when(o.ts)}`, end: <Badge tone={o.status === 'Cancelled' ? 'red' : o.status === 'Ready' || o.status === 'Out for delivery' ? 'amber' : 'green'}>{o.status}</Badge> }))]
                .map(r => (
                  <div key={r.id} className="flex items-center gap-3 border-b border-[#eff2ed] p-3 last:border-0">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f0f5ec]" aria-hidden>{r.icon}</span>
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
