'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { homeFor, type Role } from '@/rbac/policy';
import { useKart } from '@/mock/StoreProvider';
import { cx } from '@/components/ui';
import { ItemImage } from '@/components/ItemImage';

const GROUPS: { role: Role; title: string; blurb: string; icon: string; color: string }[] = [
  {
    role: 'student', title: 'Students', icon: '🎓',
    blurb: 'Shop, print, post tasks, bid on gigs and earn KC.',
    color: 'from-brand-900 to-brand-700',
  },
  {
    role: 'vendor', title: 'Vendors', icon: '🏪',
    blurb: 'Canteens, Xerox and stationery shops — each with their own console.',
    color: 'from-brand-700 to-brand-600',
  },
  {
    role: 'campus_admin', title: 'Campus Admins', icon: '🏛️',
    blurb: 'Verify students and providers, approve vendors and events.',
    color: 'from-gold-700 to-gold-500',
  },
  {
    role: 'platform_admin', title: 'Platform Admins', icon: '⚙️',
    blurb: 'Disputes, ledger, audit chain, fees and fraud alerts.',
    color: 'from-brand-900 to-[#0c2d24]',
  },
];

export default function Login() {
  const { ready, me, k, signIn, login, mode } = useKart();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeRole, setActiveRole] = useState<Role>('student');
  const router = useRouter();

  useEffect(() => { if (ready && me) router.replace(homeFor(me)); }, [ready, me, router]);
  if (!ready) return null;

  /* ── Server mode: classic sign-in form ─────────────────────────── */
  if (mode === 'server') {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-sm animate-slide-up">
          {/* Logo */}
          <div className="mb-8 flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gold-500 text-2xl font-extrabold text-brand-950 shadow-sm">K</span>
            <div>
              <div className="font-display text-3xl font-extrabold tracking-tighter text-brand-900">KART</div>
              <div className="text-[10px] font-bold uppercase tracking-[2px] text-muted">Campus, Connected</div>
            </div>
          </div>

          <h1 className="font-display text-2xl font-bold text-ink">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your campus account.</p>

          <form
            className="mt-6 grid gap-4"
            onSubmit={async e => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const err = await login(username, password);
              setBusy(false);
              if (err) setError(err);
            }}
          >
            <label className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Username</span>
              <input
                autoComplete="username"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm transition-colors focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700/30"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm transition-colors focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700/30"
              />
            </label>

            {error && (
              <p role="alert" className="flex items-center gap-2 rounded-xl border border-danger-100 bg-danger-100 px-3 py-2.5 text-xs font-bold text-danger-700">
                <span aria-hidden>⚠</span> {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-900 text-sm font-bold text-cream-50 shadow-sm transition-all hover:bg-brand-800 active:bg-brand-950 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="12" />
                  </svg>
                  Signing in…
                </>
              ) : 'Sign in →'}
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] text-muted">
            KC is simulated. Accounts are created by your campus administrator.
          </p>
        </div>
      </main>
    );
  }

  /* ── Demo mode: one-click role picker ──────────────────────────── */
  const activeGroup = GROUPS.find(g => g.role === activeRole)!;
  const demoUsers = k.db.users.filter(u => u.roles[0] === activeRole);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12 md:px-8">
      <div className="w-full max-w-4xl animate-slide-up">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-4 flex justify-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-900 text-3xl font-extrabold text-gold-500 shadow-lg">K</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
            Welcome to <span className="text-brand-900">KART</span>
          </h1>
          <p className="mt-2 text-sm text-muted">
            Tap any user below to instantly sign in and explore the platform.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          {/* Role selector */}
          <div className="grid gap-2 md:grid-cols-1">
            {GROUPS.map(g => (
              <button
                key={g.role}
                onClick={() => setActiveRole(g.role)}
                className={cx(
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-150',
                  activeRole === g.role
                    ? 'bg-brand-900 text-cream-50 shadow-md'
                    : 'border border-line bg-surface text-ink hover:border-brand-200 hover:bg-surface-2',
                )}
              >
                <span className="text-2xl" aria-hidden>{g.icon}</span>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{g.title}</div>
                  <div className={cx('text-[10px] leading-snug truncate', activeRole === g.role ? 'text-brand-200' : 'text-muted')}>{g.blurb}</div>
                </div>
              </button>
            ))}
          </div>

          {/* User cards */}
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className={cx('mb-4 flex items-center gap-2.5 rounded-xl bg-gradient-to-r px-4 py-3 text-cream-50', activeGroup.color)}>
              <span className="text-2xl" aria-hidden>{activeGroup.icon}</span>
              <div>
                <div className="text-sm font-bold">{activeGroup.title}</div>
                <div className="text-[11px] text-cream-200">{activeGroup.blurb}</div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {demoUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => { signIn(u.id); router.push(homeFor(u)); }}
                  className="flex items-center gap-3 rounded-xl border border-line p-3 text-left transition-all hover:border-brand-700 hover:bg-brand-50 active:bg-brand-100 group"
                >
                  <div className="h-10 w-10 flex-none rounded-full overflow-hidden border border-line">
                    <ItemImage name={u.name} type="user" className="w-full h-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-ink group-hover:text-brand-900 truncate">{u.name}</div>
                    <div className="text-[10px] text-muted truncate">
                      {u.storeType ? `${u.storeType} store` : u.providerEnabled ? '✓ verified provider' : activeRole === 'student' ? 'student' : ''}
                    </div>
                  </div>
                  <svg className="flex-none text-muted opacity-0 transition-opacity group-hover:opacity-100" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted">
          KC is simulated. Payments will connect to a PPI partner later; nothing here moves real money.
        </p>
      </div>
    </main>
  );
}
