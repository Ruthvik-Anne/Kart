'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { canVisit, homeFor, navFor, type NavItem, type Role, type User } from '@/rbac/policy';
import { useKart } from '@/mock/StoreProvider';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/lib/credentials';
import { useCampusName, COLLEGE_LOGO } from '@/lib/campus';
import { Button, Empty, kc } from '@/components/ui';

const ROLE_LABEL: Record<Role, string> = { student: 'Student', vendor: 'Vendor', campus_admin: 'Campus admin', platform_admin: 'Platform admin' };
const SECTION_ORDER: NavItem['section'][] = ['Campus', 'Work', 'Store', 'More', 'Admin'];

export function Shell({ children }: { children: React.ReactNode }) {
  const { ready, me, k, signOut, adopt, version } = useKart();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const campus = useCampusName(me?.campusId);

  useEffect(() => { if (ready && !me) router.replace('/login'); }, [ready, me, router]);
  useEffect(() => setOpen(false), [path]);

  // Sign-out ends the server session too, not just the browser-local one.
  const logout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* server unreachable: local session still clears */ }
    signOut();
    router.push('/login');
  };

  // Demo aid: switching performs a real sign-in so every role can be reviewed without a password.
  const switchUser = async (id: string) => {
    const account = DEMO_ACCOUNTS.find(a => a.id === id);
    if (!account || !me || account.id === me.id) return;
    setSwitchError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campusId: me.campusId, username: account.username, password: DEMO_PASSWORD }),
      });
      const data = (await res.json().catch(() => ({}))) as { user?: User; error?: string };
      if (!res.ok || !data.user) throw new Error(data.error || 'That demo account is not seeded on this server.');
      adopt(data.user);
      router.push(homeFor(data.user));
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : 'Could not switch user.');
    }
  };

  if (!ready || !me) return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading KART…</div>;

  const items = navFor(me);
  const unread = k.unreadCount(me.id);
  const role = ROLE_LABEL[me.roles[0]];
  const store = me.storeId ? k.store(me.storeId) : undefined;
  const allowed = canVisit(me, path);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[244px_minmax(0,1fr)]">
      {open && <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}
      <aside aria-label="Main navigation" className={`fixed inset-y-0 left-0 z-30 flex w-[244px] flex-col gap-6 overflow-y-auto bg-forest-950 p-4 text-[#eef8ec] transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${open ? '' : '-translate-x-full'}`}>
        <Link href={homeFor(me)} className="flex items-center gap-2.5 px-3 pt-3 font-display text-3xl font-extrabold tracking-tighter">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eeac54] text-xl text-forest-950">K</span>
          <span>KART<small className="-mt-1 block font-sans text-[10px] font-semibold tracking-[1.5px] text-[#a1bdac]">CAMPUS, CONNECTED</small></span>
        </Link>
        <div className="mx-1 -mt-2 flex items-center gap-2 rounded-xl bg-[#1b3f33] px-2 py-2">
          <Image src={COLLEGE_LOGO} alt="" width={28} height={28} className="h-7 w-7 flex-none rounded-md bg-white object-contain p-0.5" />
          <span className="min-w-0 truncate text-[9px] font-extrabold uppercase leading-tight tracking-wide text-[#9dc3a8]">{campus}</span>
        </div>
        {SECTION_ORDER.map(section => {
          const group = items.filter(i => i.section === section);
          if (!group.length) return null;
          return (
            <nav key={section} aria-label={section} className="grid gap-1">
              <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[1.7px] text-[#779b89]">{section === 'Store' ? store?.name ?? 'Store' : section}</div>
              {group.map(item => {
                const active = path === item.href || (item.href !== '/vendor' && item.href !== '/admin' && path.startsWith(item.href + '/'));
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold ${active ? 'bg-forest-700 text-white shadow-[inset_3px_0_#f4ae58]' : 'text-[#bfd3c6] hover:bg-forest-700 hover:text-white'}`}>
                    <span className="w-5 text-center text-base" aria-hidden>{item.icon}</span>{item.label}
                  </Link>
                );
              })}
            </nav>
          );
        })}
        <div className="mt-auto border-t border-[#315344] pt-4">
          <div className="flex items-center gap-3 px-2">
            <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[#eead58] font-extrabold text-[#204033]">{me.name.slice(0, 1)}</div>
            <div className="min-w-0"><b className="block truncate text-xs">{me.name}</b><span className="text-[10px] text-[#a1b9aa]">{role}{me.providerEnabled ? ' · Provider' : ''}</span></div>
          </div>
          <button onClick={logout} className="mt-3 w-full rounded-xl border border-[#315344] px-3 py-2 text-xs font-bold text-[#bfd3c6] hover:bg-forest-700 sm:hidden">Sign out</button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-[#e9eee7] bg-white px-4 md:h-20 md:px-8">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-xl border border-line text-lg md:hidden">☰</button>
          <span className="hidden max-w-64 truncate rounded-full border border-[#e4ebe2] px-3 py-2 text-[11px] font-bold text-[#244b39] sm:inline">{campus}</span>
          <span className="hidden rounded-full bg-forest-100 px-3 py-2 text-[11px] font-extrabold text-[#244b39] sm:inline">{role}</span>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {(me.roles.includes('student') || me.roles.includes('vendor')) && (
              <Link href={me.roles.includes('vendor') ? '/vendor/settlements' : '/wallet'} className="rounded-full border border-[#dcecdf] bg-forest-100 px-3 py-2 text-[11px] font-extrabold text-[#244b39]">
                {me.roles.includes('vendor') ? `Payable ${kc(k.ledger.balance(`VENDOR_PAYABLE:${me.id}`))}` : `◉ ${kc(k.balance(me.id))}`}
              </Link>
            )}
            <label className="sr-only" htmlFor="demo-user">Switch demo user</label>
            <select id="demo-user" value={me.id} onChange={e => { void switchUser(e.target.value); }}
              className="w-28 min-w-0 rounded-xl border border-[#dce7db] bg-white px-2 py-2 text-[11px] font-bold sm:w-auto sm:max-w-[9.5rem]">
              {(['student', 'vendor', 'campus_admin', 'platform_admin'] as Role[]).map(r => (
                <optgroup key={r} label={ROLE_LABEL[r]}>
                  {DEMO_ACCOUNTS.filter(a => a.role === r).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </optgroup>
              ))}
            </select>
            <Link href="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative grid h-9 w-9 place-items-center rounded-xl border border-line">🔔{unread > 0 && <sup className="absolute -right-1 -top-1 rounded-full bg-amber-kart px-1 text-[9px] font-extrabold">{unread}</sup>}</Link>
            <Button variant="secondary" size="sm" className="hidden sm:inline-flex" onClick={logout}>Sign out</Button>
          </div>
        </header>
        <div className="border-b border-[#f1ddb0] bg-[#fff5dc] px-4 py-1.5 text-center text-[11px] text-[#806528] md:px-8">
          {switchError
            ? <span role="alert" className="font-extrabold text-red-800">{switchError}</span>
            : 'KC is demo credit. Customers pay from their wallet and prove collection with the QR pass — nothing here moves real money.'}
        </div>
        <main key={path} className="mx-auto max-w-[1460px] px-4 pb-16 pt-6 md:px-10 md:pt-8">
          {allowed ? children : (
            <Empty title="403 · You don't have access to this page">
              <p>Your role ({role}) can&apos;t open this area. <Link className="font-bold text-forest-800 underline" href={homeFor(me)}>Go to your home</Link></p>
            </Empty>
          )}
        </main>
      </div>
    </div>
  );
}
