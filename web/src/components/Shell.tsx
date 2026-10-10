'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { canVisit, homeFor, navFor, type NavItem, type Role } from '@/rbac/policy';
import { useKart } from '@/mock/StoreProvider';
import { useCart } from '@/components/CartProvider';
import { Button, Empty, cx, kc } from '@/components/ui';
import { ItemImage } from '@/components/ItemImage';

const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  vendor: 'Vendor',
  campus_admin: 'Campus Admin',
  platform_admin: 'Platform Admin',
};

const SECTION_ORDER: NavItem['section'][] = ['Campus', 'Work', 'Store', 'More', 'Admin'];

const SECTION_ICONS: Partial<Record<NavItem['section'], string>> = {
  Campus: '🏫',
  Work: '⚡',
  Store: '🏪',
  More: '✦',
  Admin: '⚙',
};

export function Shell({ children }: { children: React.ReactNode }) {
  const { ready, me, k, signIn, signOut, reset, version, mode } = useKart();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const cart = useCart();

  useEffect(() => { if (ready && !me) router.replace('/login'); }, [ready, me, router]);
  useEffect(() => setOpen(false), [path]);

  if (!ready || !me) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2.5 font-display text-3xl font-extrabold tracking-tighter text-brand-900">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold-500 text-xl text-brand-950">K</span>
            KART
          </div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="12" />
            </svg>
            Loading…
          </div>
        </div>
      </div>
    );
  }

  const items = navFor(me);
  const unread = k.unreadCount(me.id);
  const role = ROLE_LABEL[me.roles[0]];
  const store = me.storeId ? k.store(me.storeId) : undefined;
  const allowed = canVisit(me, path);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_minmax(0,1fr)]">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-brand-950/60 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        aria-label="Main navigation"
        className={cx(
          'fixed inset-y-0 left-0 z-30 flex w-[260px] flex-col overflow-y-auto',
          'bg-brand-900 text-cream-200 transition-transform duration-300 ease-out',
          'md:sticky md:top-0 md:h-screen md:translate-x-0',
          open ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="px-4 pt-5 pb-3">
          <Link href={homeFor(me)} className="flex items-center gap-2.5 group">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-gold-500 text-xl font-extrabold text-brand-950 shadow-sm transition-transform group-hover:scale-105">
              K
            </span>
            <div>
              <span className="font-display text-2xl font-extrabold tracking-tighter text-cream-50">KART</span>
              <small className="block font-sans text-[9px] font-bold tracking-[2px] uppercase text-brand-200 -mt-0.5">Campus, Connected</small>
            </div>
          </Link>
        </div>

        {/* Demo mode indicator */}
        {mode === 'demo' && (
          <div className="mx-4 mb-3 rounded-xl border border-brand-700 bg-brand-800/50 px-3 py-2 text-[10px] font-bold text-brand-200">
            <span className="text-gold-400">◉ Demo</span> · KC has no monetary value
          </div>
        )}

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Site navigation">
          {SECTION_ORDER.map(section => {
            const group = items.filter(i => i.section === section);
            if (!group.length) return null;
            const sectionLabel = section === 'Store' ? store?.name ?? 'Store' : section;
            return (
              <div key={section} className="mb-1">
                <div className="flex items-center gap-1.5 px-3 py-2 text-[9px] font-bold uppercase tracking-[2px] text-brand-200/60">
                  <span aria-hidden>{SECTION_ICONS[section]}</span>
                  {sectionLabel}
                </div>
                <div className="grid gap-0.5">
                  {group.map(item => {
                    const active = path === item.href || (item.href !== '/vendor' && path.startsWith(item.href + '/'));
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cx(
                          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-all duration-150',
                          active
                            ? 'bg-gold-500 text-brand-950 shadow-sm font-bold'
                            : 'text-cream-200 hover:bg-brand-800 hover:text-cream-50',
                        )}
                      >
                        <span className="w-5 text-center text-sm flex-none" aria-hidden>{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                        {item.href === '/messages' && unread > 0 && (
                          <span className="ml-auto rounded-full bg-gold-500 px-1.5 py-0.5 text-[9px] font-bold text-brand-950">
                            {unread > 9 ? '9+' : unread}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-brand-800 px-3 py-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="h-9 w-9 flex-none rounded-full overflow-hidden border border-brand-700">
              <ItemImage name={me.name} type="user" className="w-full h-full" />
            </div>
            <div className="min-w-0 flex-1">
              <b className="block truncate text-xs text-cream-50">{me.name}</b>
              <span className="text-[10px] text-brand-200">{role}{me.providerEnabled ? ' · Provider' : ''}</span>
            </div>
          </div>

          {/* Demo user switcher */}
          {mode === 'demo' && (
            <div className="mt-2">
              <label className="sr-only" htmlFor="demo-user">Switch demo user</label>
              <select
                id="demo-user"
                value={me.id}
                onChange={e => { signIn(e.target.value); router.push(homeFor(k.user(e.target.value)!)); }}
                className="w-full rounded-xl border border-brand-700 bg-brand-800 px-3 py-2 text-[11px] font-medium text-cream-200 focus:border-gold-500 focus:outline-none"
              >
                {(['student', 'vendor', 'campus_admin', 'platform_admin'] as Role[]).map(r => (
                  <optgroup key={r} label={ROLE_LABEL[r]}>
                    {k.db.users.filter(u => u.roles[0] === r).map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => { signOut(); router.push('/login'); }}
            className="mt-2 w-full rounded-xl border border-brand-700 px-3 py-2 text-xs font-bold text-brand-200 transition-colors hover:bg-brand-800 hover:text-cream-50"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="min-w-0 flex flex-col">
        {/* Top header */}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur-sm md:h-16 md:px-8">
          {/* Mobile menu button */}
          <button
            aria-label="Open navigation menu"
            onClick={() => setOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-line text-ink transition-colors hover:bg-surface-2 md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Campus + role chips */}
          <div className="hidden items-center gap-2 sm:flex">
            <span className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[11px] font-medium text-muted">
              <span aria-hidden>📍</span> Main Campus
            </span>
            <span className="rounded-full bg-brand-50 border border-brand-100 px-3 py-1.5 text-[11px] font-bold text-brand-800">
              {role}
            </span>
          </div>

          {/* Right controls */}
          <div className="ml-auto flex items-center gap-2">
            {/* Wallet chip */}
            {(me.roles.includes('student') || me.roles.includes('vendor')) && (
              <Link
                href={me.roles.includes('vendor') ? '/vendor/settlements' : '/wallet'}
                className="hidden items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-brand-900 transition-colors hover:bg-brand-50 sm:flex"
              >
                <span className="text-gold-600" aria-hidden>◉</span>
                {me.roles.includes('vendor')
                  ? `${kc(k.ledger.balance(`VENDOR_PAYABLE:${me.id}`))}`
                  : `${kc(k.balance(me.id))}`}
                <span className="text-[8px] font-black text-muted">DEMO</span>
              </Link>
            )}

            {/* Cart */}
            {me.roles.includes('student') && (
              <button
                onClick={() => cart.setOpen(true)}
                aria-label={cart.count ? `Open cart, ${cart.count} items` : 'Open cart'}
                className="relative grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface transition-colors hover:bg-surface-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
                {cart.count > 0 && (
                  <sup className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[9px] font-extrabold text-brand-950">
                    {cart.count > 9 ? '9+' : cart.count}
                  </sup>
                )}
              </button>
            )}

            {/* Notifications */}
            <Link
              href="/notifications"
              aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
              className="relative grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface transition-colors hover:bg-surface-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unread > 0 && (
                <sup className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[9px] font-extrabold text-brand-950">
                  {unread > 9 ? '9+' : unread}
                </sup>
              )}
            </Link>

            {/* Sign out (desktop) */}
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => { signOut(); router.push('/login'); }}>
              Sign out
            </Button>
          </div>
        </header>

        {/* Demo notice */}
        {mode === 'demo' && (
          <div className="border-b border-gold-100 bg-gold-50 px-4 py-2 text-center text-[11px] text-gold-700 md:px-8">
            <span className="font-bold">Demo mode</span> · Role switching is for exploring only. KC is simulated and has no monetary value.{' '}
            <button
              onClick={() => { if (confirm('Reset all demo data in this browser?')) reset(); }}
              className="font-extrabold underline hover:no-underline"
            >
              Reset data
            </button>
          </div>
        )}

        {/* Page content */}
        <main key={path} className="flex-1 mx-auto w-full max-w-[1500px] px-4 pb-16 pt-6 md:px-10 md:pt-8 animate-fade-in">
          {allowed ? children : (
            <Empty icon="🔒" title="Access denied">
              <p>Your role ({role}) can&apos;t open this area.</p>
              <Link className="mt-3 inline-block font-bold text-brand-800 underline" href={homeFor(me)}>Go to your home</Link>
            </Empty>
          )}
        </main>
      </div>
    </div>
  );
}
