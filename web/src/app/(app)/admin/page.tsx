'use client';
import Link from 'next/link';
import { useKart } from '@/mock/StoreProvider';
import { navFor } from '@/rbac/policy';
import { CampusHeader } from '@/components/CampusHeader';
import { Badge, Card, Empty, kc, Stat, StatGrid, when } from '@/components/ui';

export default function AdminOverview() {
  const { k, me } = useKart();
  if (!me) return null;
  const isPlatform = me.roles.includes('platform_admin');
  const verifications = k.db.verifications.filter(v => v.status === 'pending');
  const vendorApps = k.db.vendorApps.filter(a => a.status === 'pending');
  const events = k.db.events.filter(e => e.status === 'pending');
  const disputes = k.db.tasks.filter(t => t.status === 'disputed');
  const openTasks = k.db.tasks.filter(t => ['open', 'bidding'].includes(t.status));
  const activeOrders = k.db.orders.filter(o => ['Placed', 'Preparing', 'Ready', 'Out for delivery'].includes(o.status));
  const gross = k.db.orders.filter(o => o.status !== 'Cancelled').reduce((a, o) => a + o.amount, 0);
  const tools = navFor(me).filter(i => i.section === 'Admin');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const waiting = [
    { label: 'Provider verifications', value: verifications.length, href: '/admin/verification', icon: '✔' },
    { label: 'Vendor applications', value: vendorApps.length, href: '/admin/vendors', icon: '🏪' },
    { label: 'Event approvals', value: events.length, href: '/admin/events', icon: '◇' },
    ...(isPlatform ? [{ label: 'Open disputes', value: disputes.length, href: '/admin/disputes', icon: '⚖' }] : []),
  ].filter(x => x.value > 0);

  return (
    <>
      <CampusHeader
        campusId={me.campusId}
        kicker={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        role={isPlatform ? 'Platform admin' : 'Campus admin'}
        title={`${greeting}, ${me.name.split(' ')[0]}`}
        sub="Campus operations at a glance — approvals waiting on you, live commerce and the tools to run it."
      />
      <StatGrid>
        <Stat label="Live orders" value={activeOrders.length} note="Across every store" />
        <Stat label="Gross value" value={kc(gross)} note="Paid at checkout" />
        <Stat label="Waiting on you" value={verifications.length + vendorApps.length + events.length + disputes.length} note="Approvals & disputes" />
        <Stat label="People on KART" value={k.db.users.length} note={`${k.db.stores.length} stores · ${openTasks.length} open tasks`} />
      </StatGrid>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {waiting.length === 0 ? (
          <Card className="sm:col-span-2 lg:col-span-4"><Empty title="Nothing is waiting on you">New verifications, vendor applications and disputes land here.</Empty></Card>
        ) : waiting.map(x => (
          <Link key={x.label} href={x.href} className="rounded-2xl border border-line bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className="flex items-center justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff1d7] text-xl" aria-hidden>{x.icon}</span>
              <span className="font-display text-3xl font-bold">{x.value}</span>
            </div>
            <strong className="mt-3 block font-display text-sm">{x.label}</strong>
            <span className="text-[10px] text-muted">Review now →</span>
          </Link>
        ))}
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {tools.map(item => (
          <Link key={item.href} href={item.href} className="rounded-2xl border border-line bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className="mb-2.5 grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-xl" aria-hidden>{item.icon}</div>
            <strong className="block font-display text-sm">{item.label}</strong>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-display text-lg font-bold">Campus activity</h2>
          {k.db.orders.slice(0, 5).length === 0 ? <p className="text-xs text-muted">Orders placed on campus will stream in here.</p> : (
            <div>
              {k.db.orders.slice(0, 6).map(o => (
                <div key={o.id} className="flex items-center gap-3 border-b border-[#eff2ed] py-2.5 last:border-0">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f0f5ec]" aria-hidden>{o.kind === 'print' ? '🖨️' : o.kind === 'food' ? '🍽️' : '📐'}</span>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-xs">{o.title}</b>
                    <span className="text-[10px] text-muted">{k.store(o.storeId)?.name} · {when(o.ts)}</span>
                  </div>
                  <Badge tone={o.status === 'Cancelled' ? 'red' : o.status === 'Ready' || o.status === 'Out for delivery' ? 'amber' : 'green'}>{o.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-display text-lg font-bold">Audit notes</h2>
          {k.db.audit.length === 0 ? <p className="text-xs text-muted">Approvals and corrections you record are logged here.</p> : (
            <div>
              {k.db.audit.slice(0, 6).map(a => (
                <div key={a.id} className="border-b border-[#eff2ed] py-2.5 last:border-0 text-xs">
                  <b>{k.user(a.actorId)?.name ?? 'System'}</b> <span className="text-muted">{when(a.ts)}</span>
                  <p className="mt-0.5 text-[11px] text-[#3f5c4b]">{a.text}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
