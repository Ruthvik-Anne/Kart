'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { homeFor, type Role } from '@/rbac/policy';
import { useKart } from '@/mock/StoreProvider';

const GROUPS: { role: Role; title: string; blurb: string }[] = [
  { role: 'student', title: 'Students', blurb: 'Shop, print, post tasks, bid and earn KC. Providers get an extra hub.' },
  { role: 'vendor', title: 'Vendors', blurb: 'Canteens, Xerox and stationery shops, each with their own console.' },
  { role: 'campus_admin', title: 'Campus administrators', blurb: 'Verify students and providers, approve vendors and events.' },
  { role: 'platform_admin', title: 'Platform administrators', blurb: 'Disputes, ledger, audit chain, fees and fraud alerts.' },
];

export default function Login() {
  const { ready, me, k, signIn, login, mode } = useKart();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  useEffect(() => { if (ready && me) router.replace(homeFor(me)); }, [ready, me, router]);
  if (!ready) return null;

  if (mode === 'server') {
    return (
      <main className="mx-auto max-w-sm px-5 py-16">
        <div className="mb-8 flex items-center gap-3 font-display text-4xl font-extrabold tracking-tighter">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#eeac54] text-2xl text-forest-950">K</span>KART
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Sign in</h1>
        <form className="mt-6 grid gap-4" onSubmit={async e => {
          e.preventDefault(); setBusy(true); setError('');
          const err = await login(username, password);
          setBusy(false);
          if (err) setError(err);
        }}>
          <label className="grid gap-1.5 text-[11px] font-extrabold">Username
            <input autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} className="w-full rounded-xl border border-xdce7db bg-surface px-3 py-2.5 text-xs font-medium" />
          </label>
          <label className="grid gap-1.5 text-[11px] font-extrabold">Password
            <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-xl border border-xdce7db bg-surface px-3 py-2.5 text-xs font-medium" />
          </label>
          {error && <p role="alert" className="text-xs font-bold text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-xl bg-forest-800 px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="mt-8 text-[11px] text-muted">KC is simulated. Accounts are created by your campus administrator.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <div className="mb-8 flex items-center gap-3 font-display text-4xl font-extrabold tracking-tighter">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#eeac54] text-2xl text-forest-950">K</span>KART
      </div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Pick a demo user</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">This is a front-end demo with no real sign-in. Choose a person to see how the sidebar, pages and permissions change by role. You can switch users any time from the top bar.</p>
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {GROUPS.map(g => (
          <section key={g.role} className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-display text-lg font-bold">{g.title}</h2>
            <p className="mb-3 mt-1 text-xs text-muted">{g.blurb}</p>
            <div className="grid gap-2">
              {k.db.users.filter(u => u.roles[0] === g.role).map(u => (
                <button key={u.id} onClick={() => { signIn(u.id); router.push(homeFor(u)); }}
                  className="rounded-xl border border-xdce7dc px-3 py-2.5 text-left text-xs font-bold text-forest-800 hover:bg-forest-100">
                  {u.name}
                  <span className="ml-2 font-medium text-muted">
                    {u.storeType ? `${u.storeType} store` : u.providerEnabled ? 'verified provider' : g.role === 'student' ? 'student' : ''}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-8 text-[11px] text-muted">KC is simulated. Payments will connect to an existing PPI partner later; nothing here moves real money.</p>
    </main>
  );
}
