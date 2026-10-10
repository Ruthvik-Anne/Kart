'use client';
// Holds the mock backend in React state, persists it to localStorage, and exposes the demo session.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Kart, seed, type Db, type Result } from './db';
import type { User } from '@/rbac/policy';
import { ACTIONS } from '@/server/service';

const DB_KEY = 'kart-web-db-v4';
const SESSION_KEY = 'kart-web-session-v1';

interface Toast { id: number; text: string; tone: 'ok' | 'error' }

interface Ctx {
  ready: boolean;
  k: Kart;
  me: User | null;
  version: number;
  /** Run a mutation, persist, re-render, toast the outcome. */
  act: <T extends object>(fn: (k: Kart, me: User) => Result<T> | Promise<Result<T>>, okText?: string) => Promise<Result<T>>;
  /** 'demo' runs the mock backend in the browser; 'server' talks to /api with a real session. */
  mode: 'demo' | 'server';
  signIn: (userId: string) => void;
  login: (username: string, password: string) => Promise<string | null>;
  refresh: () => Promise<void>;
  signOut: () => void;
  reset: () => void;
  toasts: Toast[];
}

const StoreCtx = createContext<Ctx | null>(null);

export function useKart(): Ctx {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useKart must be used inside <StoreProvider>');
  return ctx;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const kart = useRef<Kart>(null as unknown as Kart);
  if (!kart.current) kart.current = new Kart(seed());
  const [ready, setReady] = useState(false);
  const [serverChecked, setServerChecked] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [mode, setMode] = useState<'demo' | 'server'>('demo');
  const [serverUser, setServerUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const persist = useCallback(() => {
    try { localStorage.setItem(DB_KEY, JSON.stringify(kart.current.db)); } catch { /* storage full or blocked: demo continues in memory */ }
  }, []);

  const adopt = useCallback((db: Db, user: User | null) => {
    kart.current = new Kart(db);
    setServerUser(user);
    setVersion(v => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/session', { cache: 'no-store' });
        const data = await res.json() as { server?: boolean; user?: User | null; db?: Db };
        if (cancelled || !data.server) return;
        setMode('server');
        if (data.user && data.db) adopt(data.db, data.user);
      } catch { /* no API (static export or offline): stay in demo mode */ }
      finally { if (!cancelled) setServerChecked(true); }
    })();
    return () => { cancelled = true; };
  }, [adopt]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const db = JSON.parse(raw) as Db;
        const arrays: (keyof Db)[] = ['users', 'entries', 'tasks', 'listings', 'events', 'tickets', 'vendorApps', 'stores', 'products', 'orders', 'reviews', 'workflows', 'promos', 'promoUses', 'wishlist'];
        if (arrays.every(key => Array.isArray(db[key]))) kart.current = new Kart(db);
      }
      setSessionId(localStorage.getItem(SESSION_KEY));
    } catch { /* corrupt saved data: fall back to fresh seed */ }
    setReady(true);
  }, []);

  // Keep several tabs in step, which also mimics the realtime channel the backend will provide.
  useEffect(() => {
    if (mode === 'server') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === DB_KEY && e.newValue) {
        try { kart.current = new Kart(JSON.parse(e.newValue) as Db); setVersion(v => v + 1); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [mode]);

  const toast = useCallback((text: string, tone: Toast['tone']) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
  }, []);

  const me = useMemo(() => mode === 'server' ? serverUser : kart.current.user(sessionId ?? '') ?? null, [mode, serverUser, sessionId, version, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const act: Ctx['act'] = useCallback(async (fn, okText) => {
    const user = mode === 'server' ? serverUser : kart.current.user(sessionId ?? '');
    if (!user) { const r = { ok: false as const, error: 'Please sign in.' }; toast(r.error, 'error'); return r; }
    if (mode === 'server') {
      // Methods called on this proxy run on the server as the signed-in user; the reply carries their refreshed snapshot.
      let latest: { db: Db; user: User } | null = null;
      const remote = new Proxy({}, {
        get: (_t, name) => {
          if (typeof name !== 'string' || !(ACTIONS as readonly string[]).includes(name)) return undefined;
          return async (_actor: User, ...args: unknown[]) => {
            try {
              const res = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: name, args }) });
              if (res.status === 401) { setServerUser(null); return { ok: false as const, error: 'Your session expired. Please sign in again.' }; }
              const data = await res.json() as { result?: Result; db?: Db; error?: string };
              if (data.db) latest = { db: data.db, user };
              return data.result ?? { ok: false as const, error: data.error ?? 'Request failed.' };
            } catch { return { ok: false as const, error: 'Could not reach the server.' }; }
          };
        },
      }) as unknown as Kart;
      const outcome = await fn(remote, user);
      if (latest) adopt((latest as { db: Db }).db, user);
      if (outcome.ok) { if (okText) toast(okText, 'ok'); } else toast(outcome.error, 'error');
      return outcome;
    }
    const result = await fn(kart.current, user);
    if (result.ok) { persist(); setVersion(v => v + 1); if (okText) toast(okText, 'ok'); }
    else toast(result.error, 'error');
    return result;
  }, [mode, serverUser, adopt, sessionId, persist, toast]);

  const signIn = useCallback((userId: string) => {
    localStorage.setItem(SESSION_KEY, userId);
    setSessionId(userId);
  }, []);
  const login: Ctx['login'] = useCallback(async (username, password) => {
    try {
      const res = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) return data.error ?? 'Sign in failed.';
      const me = await (await fetch('/api/session', { cache: 'no-store' })).json() as { user?: User; db?: Db };
      if (!me.user || !me.db) return 'Sign in failed.';
      adopt(me.db, me.user);
      return null;
    } catch { return 'Could not reach the server.'; }
  }, [adopt]);
  const signOut = useCallback(() => {
    if (mode === 'server') {
      void fetch('/api/session', { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
      setServerUser(null);
      return;
    }
    localStorage.removeItem(SESSION_KEY); setSessionId(null);
  }, [mode]);
  const reset = useCallback(() => {
    kart.current = new Kart(seed());
    persist();
    setVersion(v => v + 1);
    toast('Demo data reset', 'ok');
  }, [persist, toast]);

  const refresh = useCallback(async () => {
    if (mode !== 'server') { setVersion(v => v + 1); return; }
    const response = await fetch('/api/session', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not refresh campus state.');
    const data = await response.json() as { user?: User | null; db?: Db };
    if (!data.user || !data.db) throw new Error('Your session expired.');
    adopt(data.db, data.user);
  }, [mode, adopt]);

  const value: Ctx = { ready: ready && serverChecked, mode, k: kart.current, me, version, act, signIn, login, refresh, signOut, reset, toasts };
  return (
    <StoreCtx.Provider value={value}>
      {children}
      <div aria-live="polite" className="fixed bottom-5 right-5 z-50 grid gap-2">
        {toasts.map(t => (
          <div key={t.id} role="status" className={`rounded-xl px-4 py-3 text-xs font-bold text-white shadow-lg ${t.tone === 'error' ? 'bg-red-700' : 'bg-brand-900'}`}>{t.text}</div>
        ))}
      </div>
    </StoreCtx.Provider>
  );
}
