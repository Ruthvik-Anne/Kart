'use client';
import Image from 'next/image';
import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { homeFor, type Role, type User } from '@/rbac/policy';
import { useKart } from '@/mock/StoreProvider';
import { Button, Field, inputCls, cx } from '@/components/ui';
import {
  nameError, normalizeUsername, passwordError, usernameError,
  DEMO_ACCOUNTS, DEMO_GROUP_TITLES, DEMO_PASSWORD, type DemoAccount,
} from '@/lib/credentials';
import { COLLEGE_IMAGE, COLLEGE_LOGO } from '@/lib/campus';

type College = { id: string; name: string };

type Mode = 'signin' | 'signup';
type Fields = { username?: string; password?: string; name?: string; confirm?: string };

function Logo({ className }: { className?: string }) {
  return (
    <span className={cx('flex items-center gap-2.5 font-display font-extrabold tracking-tighter', className)}>
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eeac54] text-xl text-forest-950">K</span>
      KART
    </span>
  );
}

function Spinner() {
  return <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

function Banner({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'}
      className={cx('mb-4 rounded-xl border px-4 py-3 text-xs font-bold leading-relaxed',
        tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-[#f1ddb0] bg-[#fff5dc] text-[#806528]')}>
      {children}
    </div>
  );
}

function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

function Login() {
  const { ready, me, adopt } = useKart();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));

  const [mode, setMode] = useState<Mode>('signin');
  const [college, setCollege] = useState('');
  const [collegeConfirmed, setCollegeConfirmed] = useState(false);
  const [colleges, setColleges] = useState<College[]>([]);
  const [collegeError, setCollegeError] = useState<string | null>(null);
  const [collegesLoading, setCollegesLoading] = useState(true);
  const [seeded, setSeeded] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({});
  const left = useRef(false); // set once we navigate ourselves, so the auto-redirect stands down

  useEffect(() => {
    if (ready && me && !left.current) {
      left.current = true;
      router.replace(next ?? homeFor(me));
    }
  }, [ready, me, next, router]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/colleges', { cache: 'no-store' })
      .then(async res => {
        if (!res.ok) throw new Error('The college directory is unavailable. Try again later.');
        return res.json() as Promise<{ colleges: College[]; seeded?: boolean }>;
      })
      .then(data => { if (!cancelled) { setColleges(data.colleges); setSeeded(!!data.seeded); } })
      .catch(err => { if (!cancelled) setCollegeError(err instanceof Error ? err.message : 'Could not load colleges.'); })
      .finally(() => { if (!cancelled) setCollegesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center">
        <span role="status" className="h-6 w-6 animate-spin rounded-full border-2 border-[#cfe0d2] border-t-forest-800" />
      </div>
    );
  }

  const enter = (user: User) => {
    adopt(user);
    left.current = true;
    router.push(next ?? homeFor(user));
  };
  const selectedCollege = colleges.find(item => item.id === college);

  const post = async (path: string, body: object): Promise<User> => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { user?: User; error?: string };
    if (!res.ok || !data.user) {
      throw new Error(data.error || (res.status === 401 ? 'Incorrect username or password.' : 'Request failed. Try again.'));
    }
    return data.user;
  };

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    const u = normalizeUsername(username);
    let nextFields: Fields = {};
    if (mode === 'signup') {
      nextFields = {
        name: nameError(name) ?? undefined,
        username: usernameError(u) ?? undefined,
        password: passwordError(password) ?? undefined,
        confirm: confirm !== password ? 'Passwords do not match.' : undefined,
      };
    } else {
      nextFields = {
        username: usernameError(u) ?? undefined,
        password: passwordError(password) ?? (password ? undefined : 'Enter your password.'),
      };
    }
    if (Object.values(nextFields).some(Boolean)) {
      setFields(nextFields);
      return;
    }
    setFields({});

    setBusy('form');
    try {
      const user = mode === 'signin'
        ? await post('/api/auth/login', { campusId: college, username: u, password })
        : await post('/api/auth/signup', { campusId: college, name: name.trim(), username: u, password });
      enter(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(null);
    }
  };

  const switchMode = (m: Mode) => { setMode(m); setFields({}); setError(null); };

  const continueToLogin = (e: FormEvent) => {
    e.preventDefault();
    if (selectedCollege) setCollegeConfirmed(true);
  };

  /** One-click sign-in for the seeded demo accounts, so every role can be reviewed straight away. */
  const signInDemo = async (account: DemoAccount) => {
    if (busy) return;
    setError(null);
    setFields({});
    setBusy(`demo-${account.id}`);
    try {
      const user = await post('/api/auth/login', {
        campusId: college || colleges[0]?.id || 'main',
        username: account.username,
        password: DEMO_PASSWORD,
      });
      enter(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(null);
    }
  };

  const ROLE_ORDER: Role[] = ['student', 'vendor', 'campus_admin', 'platform_admin'];

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-forest-950 p-10 text-[#eef8ec] lg:flex lg:flex-col">
        <Image src="/college/campus.png" alt="Velagapudi Ramakrishna Siddhartha Engineering College campus" fill priority sizes="55vw" className="object-cover opacity-25" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-forest-950 via-forest-950/75 to-forest-950/30" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#1d4536] blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-[#163a2c] blur-3xl" />
        <Logo className="relative text-3xl text-white" />
        <div className="relative mt-auto max-w-md">
          <p className="text-[11px] font-extrabold uppercase tracking-[2px] text-[#8fb59b]">Campus, connected</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight text-white">
            Your campus, all in one place.
          </h1>
          <ul className="mt-7 grid gap-3 text-sm text-[#bfd3c6]">
            {[
              ['🛍️', 'Food, Xerox, supplies and merch from campus vendors'],
              ['📌', 'Ranked task board with private chat and escrowed KC'],
              ['🎟️', 'Events, resale, rentals and provider services'],
              ['🔐', 'Real sign-in with server-side sessions and role guards'],
            ].map(([icon, text]) => (
              <li key={text} className="flex items-start gap-3">
                <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-[#24513e] text-sm">{icon}</span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-auto pt-10 text-[11px] text-[#779b89]">KC is simulated. Nothing here moves real money.</p>
      </section>

      <section className="flex min-h-screen flex-col px-5 py-8 sm:px-10">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <Logo className="text-2xl text-forest-950 lg:hidden" />

          <div className="my-auto py-8">
            {!collegeConfirmed ? (
              <div>
                <span className="inline-flex rounded-full bg-forest-100 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-forest-800">Step 1 of 2</span>
                <h1 className="mt-5 font-display text-3xl font-bold tracking-tight">Find your college</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted">Select your college to open its KART sign-in portal.</p>
                <form onSubmit={continueToLogin} className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-sm">
                  <label htmlFor="college" className="mb-2 block text-xs font-extrabold text-forest-800">College</label>
                  <select id="college" name="college" required value={college} onChange={e => setCollege(e.target.value)} disabled={collegesLoading || !!collegeError}
                    className={cx(inputCls, 'w-full bg-white')}>
                    <option value="">{collegesLoading ? 'Loading colleges…' : 'Select your college'}</option>
                    {colleges.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  {collegeError && <p role="alert" className="mt-2 text-xs font-bold text-red-700">{collegeError}</p>}
                  {selectedCollege && (
                    <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#d8e7d9] bg-forest-100 px-3 py-2.5">
                      <Image src={COLLEGE_LOGO} alt={`${selectedCollege.name} logo`} width={52} height={52}
                        className="h-13 w-13 rounded-lg bg-white object-contain p-1" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#5d8369]">Your college</p>
                        <p className="truncate text-sm font-bold text-forest-800">{selectedCollege.name}</p>
                      </div>
                    </div>
                  )}
                  <Button type="submit" disabled={!selectedCollege} className="mt-5 w-full">Continue to sign in <span aria-hidden>→</span></Button>
                </form>

                <div className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-base font-bold">Demo accounts</h2>
                    <span className={cx('rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wider',
                      seeded ? 'bg-forest-100 text-[#2f6a41]' : 'bg-[#fde8e8] text-[#b42318]')}>
                      {seeded ? 'POSTGRES-SEEDED' : 'NOT SEEDED YET'}
                    </span>
                  </div>
                  {error && <div className="mt-3"><Banner tone="error">{error}</Banner></div>}
                  <p className="mt-2 text-[11px] leading-relaxed text-muted">
                    Sign in with the <b className="text-[#3f5c4b]">username</b> under each name and the shared demo <b className="text-[#3f5c4b]">password</b>{' '}
                    <code className="rounded bg-[#f3f7f1] px-1 py-0.5 font-mono text-[10px] font-bold text-forest-800">{DEMO_PASSWORD}</code>.
                    Pick any account to land on that role&apos;s dashboard.
                  </p>
                  {!seeded && !collegesLoading && (
                    <p className="mt-2 text-[11px] font-bold text-[#b42318]">Run <code className="font-mono">npm run db:seed</code> with KART_SEED_DEMO=true to create these accounts.</p>
                  )}
                  <div className="mt-3 grid gap-3">
                    {ROLE_ORDER.map(role => {
                      const group = DEMO_ACCOUNTS.filter(a => a.role === role);
                      if (!group.length) return null;
                      return (
                        <div key={role}>
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#5d8369]">{DEMO_GROUP_TITLES[role]}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {group.map(account => (
                              <button key={account.id} type="button" disabled={!!busy} onClick={() => void signInDemo(account)}
                                className="flex items-center gap-2 rounded-xl border border-[#dce7db] bg-white px-2.5 py-1.5 text-left transition hover:border-[#9dc3a8] hover:bg-forest-100 disabled:opacity-60">
                                <span className="grid h-6 w-6 flex-none place-items-center rounded-lg bg-forest-100 text-[10px] font-extrabold text-forest-800">{account.name.slice(0, 1)}</span>
                                <span className="leading-tight">
                                  <b className="block text-[11px] text-[#243b2d]">{account.name}</b>
                                  <span className="block font-mono text-[9px] text-muted">{account.username}{account.note ? ` · ${account.note}` : ''}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="mt-4 text-xs text-muted">Can&apos;t find your college? Contact the KART campus team.</p>
              </div>
            ) : (
            <>
            <button type="button" onClick={() => { setCollegeConfirmed(false); setError(null); setFields({}); }}
              className="mb-5 text-xs font-bold text-forest-800 hover:underline">← Change college</button>
            <div className="mb-5 flex items-center gap-4 rounded-xl border border-[#d8e7d9] bg-forest-100 px-4 py-3">
              <Image src="/college/logo.jpg" alt="College logo" width={58} height={58} className="h-14 w-14 rounded-lg bg-white object-contain p-1" />
              <div><p className="text-[10px] font-extrabold uppercase tracking-wider text-[#5d8369]">Your college</p>
              <p className="mt-1 text-sm font-bold text-forest-800">{selectedCollege?.name}</p></div>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              {mode === 'signin' ? 'Sign in to your campus' : 'Create your account'}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {mode === 'signin'
                ? 'Use your college username and password.'
                : 'New here? Register with your campus username to start as a student.'}
            </p>

            <div role="tablist" aria-label="Authentication" className="mt-6 flex gap-1 border-b border-[#e1e9df]">
              {(['signin', 'signup'] as Mode[]).map(m => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
                  className={cx('border-b-2 px-4 py-2.5 text-xs font-extrabold',
                    mode === m ? 'border-[#2e6a48] text-[#27543c]' : 'border-transparent text-[#77907b]')}>
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <form onSubmit={submitForm} noValidate className="mt-5 rounded-2xl border border-line bg-white p-5">
              {error && <Banner tone="error">{error}</Banner>}

              {mode === 'signup' && (
                <div className="mb-4">
                  <Field label="Full name">
                    <input id="name" name="name" value={name} onChange={e => { setName(e.target.value); setFields(f => ({ ...f, name: undefined })); }}
                      autoComplete="name" maxLength={80} aria-invalid={!!fields.name} aria-describedby={fields.name ? 'name-err' : undefined}
                      className={cx(inputCls, fields.name && 'border-red-400')} placeholder="e.g. Ananya Iyer" />
                  </Field>
                  {fields.name && <p id="name-err" className="mt-1 text-[11px] font-bold text-red-700">{fields.name}</p>}
                </div>
              )}

              <div className="mb-4">
                <Field label="Username">
                  <input id="username" name="username" value={username} autoFocus={mode === 'signin'}
                    onChange={e => { setUsername(e.target.value); setFields(f => ({ ...f, username: undefined })); }}
                    autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={32}
                    aria-invalid={!!fields.username} aria-describedby={fields.username ? 'username-err' : undefined}
                    className={cx(inputCls, 'font-mono', fields.username && 'border-red-400')} placeholder="e.g. alex" />
                </Field>
                {fields.username && <p id="username-err" className="mt-1 text-[11px] font-bold text-red-700">{fields.username}</p>}
              </div>

              <div className="mb-4">
                <Field label="Password">
                  <span className="relative block">
                    <input id="password" name="password" type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => { setPassword(e.target.value); setFields(f => ({ ...f, password: undefined })); }}
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} maxLength={128}
                      aria-invalid={!!fields.password} aria-describedby={fields.password ? 'password-err' : undefined}
                      className={cx(inputCls, 'pr-16', fields.password && 'border-red-400')}
                      placeholder={mode === 'signin' ? 'Your password' : '12+ characters'} />
                    <button type="button" onClick={() => setShowPassword(s => !s)} aria-pressed={showPassword}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[10px] font-extrabold text-[#5d8369] hover:bg-forest-100">
                      {showPassword ? 'HIDE' : 'SHOW'}
                    </button>
                  </span>
                </Field>
                {fields.password && <p id="password-err" className="mt-1 text-[11px] font-bold text-red-700">{fields.password}</p>}
              </div>

              {mode === 'signup' && (
                <div className="mb-4">
                  <Field label="Confirm password">
                    <input id="confirm" name="confirm" type={showPassword ? 'text' : 'password'} value={confirm}
                      onChange={e => { setConfirm(e.target.value); setFields(f => ({ ...f, confirm: undefined })); }}
                      autoComplete="new-password" maxLength={128}
                      aria-invalid={!!fields.confirm} aria-describedby={fields.confirm ? 'confirm-err' : undefined}
                      className={cx(inputCls, fields.confirm && 'border-red-400')} placeholder="Type it again" />
                  </Field>
                  {fields.confirm && <p id="confirm-err" className="mt-1 text-[11px] font-bold text-red-700">{fields.confirm}</p>}
                </div>
              )}

              <Button type="submit" disabled={!!busy} aria-busy={!!busy} className="mt-1 w-full">
                {busy === 'form' && <Spinner />}
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
              <p className="mt-3 text-center text-[11px] text-muted">
                {mode === 'signin'
                  ? 'Sessions last 7 days on this device.'
                  : 'Staff roles (vendor, admin) are provisioned by your campus team.'}
              </p>
            </form>

            </>
            )}
          </div>

          <p className="text-[11px] text-muted">
            KC is simulated. Payments will connect to an existing PPI partner later; nothing here moves real money.
          </p>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}
