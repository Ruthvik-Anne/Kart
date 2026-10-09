'use client';
// Holds the mock backend in React state, persists it to localStorage, and exposes the demo session.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Kart, seed, type Db, type Result } from './db';
import type { User } from '@/rbac/policy';

const DB_KEY = 'kart-web-db-v3';
const SESSION_KEY = 'kart-web-session-v1';

interface Toast { id: number; text: string; tone: 'ok' | 'error' }

interface Ctx {
  ready: boolean;
  k: Kart;
  me: User | null;
  version: number;
  /** Run a mutation, persist, re-render, toast the outcome. */
  act: <T extends object>(fn: (k: Kart, me: User) => Result<T> | Promise<Result<T>>, okText?: string) => Promise<Result<T>>;
  signIn: (userId: string) => void;
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const persist = useCallback(() => {
    try { localStorage.setItem(DB_KEY, JSON.stringify(kart.current.db)); } catch { /* storage full or blocked: demo continues in memory */ }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const db = JSON.parse(raw) as Db;
        const arrays: (keyof Db)[] = ['users', 'entries', 'tasks', 'listings', 'events', 'tickets', 'vendorApps', 'stores', 'products', 'orders', 'reviews', 'workflows'];
        if (arrays.every(key => Array.isArray(db[key]))) kart.current = new Kart(db);
      }
      setSessionId(localStorage.getItem(SESSION_KEY));
    } catch { /* corrupt saved data: fall back to fresh seed */ }
    setReady(true);
  }, []);

  // Keep several tabs in step, which also mimics the realtime channel the backend will provide.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DB_KEY && e.newValue) {
        try { kart.current = new Kart(JSON.parse(e.newValue) as Db); setVersion(v => v + 1); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toast = useCallback((text: string, tone: Toast['tone']) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
  }, []);

  const me = useMemo(() => kart.current.user(sessionId ?? '') ?? null, [sessionId, version, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const act: Ctx['act'] = useCallback(async (fn, okText) => {
    const user = kart.current.user(sessionId ?? '');
    if (!user) { const r = { ok: false as const, error: 'Please sign in.' }; toast(r.error, 'error'); return r; }
    const result = await fn(kart.current, user);
    if (result.ok) { persist(); setVersion(v => v + 1); if (okText) toast(okText, 'ok'); }
    else toast(result.error, 'error');
    return result;
  }, [sessionId, persist, toast]);

  const signIn = useCallback((userId: string) => {
    localStorage.setItem(SESSION_KEY, userId);
    setSessionId(userId);
  }, []);
  const signOut = useCallback(() => { localStorage.removeItem(SESSION_KEY); setSessionId(null); }, []);
  const reset = useCallback(() => {
    kart.current = new Kart(seed());
    persist();
    setVersion(v => v + 1);
    toast('Demo data reset', 'ok');
  }, [persist, toast]);

  const value: Ctx = { ready, k: kart.current, me, version, act, signIn, signOut, reset, toasts };
  return (
    <StoreCtx.Provider value={value}>
      {children}
      <div aria-live="polite" className="fixed bottom-5 right-5 z-50 grid gap-2">
        {toasts.map(t => (
          <div key={t.id} role="status" className={`rounded-xl px-4 py-3 text-xs font-bold text-white shadow-lg ${t.tone === 'error' ? 'bg-red-700' : 'bg-forest-800'}`}>{t.text}</div>
        ))}
      </div>
    </StoreCtx.Provider>
  );
}
