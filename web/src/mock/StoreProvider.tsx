'use client';
// UI adapter for authenticated, campus-scoped state and server-checked mutations.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Kart, emptyState, type Db, type Result } from './db';
import type { User } from '@/rbac/policy';

interface Toast { id: number; text: string; tone: 'ok' | 'error' }

interface Ctx {
  ready: boolean;
  k: Kart;
  me: User | null;
  version: number;
  /** Run a server-checked mutation, then refresh the visible campus state. */
  act: <T extends object>(fn: (k: Kart, me: User) => Result<T> | Promise<Result<T>>, okText?: string) => Promise<Result<T>>;
  /** Load state after the auth server establishes a session. */
  adopt: (user: User) => void;
  refresh: () => Promise<void>;
  signOut: () => void;
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
  if (!kart.current) kart.current = new Kart(emptyState());
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const loadState = useCallback(async (user: User) => {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (!res.ok) throw new Error('Campus data is unavailable. Try again.');
    const { state } = await res.json() as { state: Db };
    kart.current = new Kart(state);
    setSessionId(user.id);
    setVersion(v => v + 1);
  }, []);

  const adoptUser = useCallback((user: User) => {
    void loadState(user).catch(() => setSessionId(null));
  }, [loadState]);

  useEffect(() => {
    // Only a verified server session may restore access after a page load.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        if (res.ok) {
          const { user } = (await res.json()) as { user: User | null };
          if (user && !cancelled) await loadState(user);
        }
      } catch { /* Fail closed when the auth API is unavailable. */ }
      if (cancelled) return;
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [loadState]);

  const toast = useCallback((text: string, tone: Toast['tone']) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
  }, []);

  const me = useMemo(() => kart.current.user(sessionId ?? '') ?? null, [sessionId, version]);

  const act: Ctx['act'] = useCallback(async (fn, okText) => {
    const user = kart.current.user(sessionId ?? '');
    if (!user) { const r = { ok: false as const, error: 'Please sign in.' }; toast(r.error, 'error'); return r; }
    let call: { action: string; args: unknown[] } | null = null;
    const recorder = new Proxy(kart.current, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          call = { action: String(property), args };
          return { ok: true };
        };
      },
    });
    try {
      await fn(recorder, user);
      if (!call) throw new Error('No action was selected.');
      const res = await fetch('/api/state', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(call),
      });
      const data = await res.json() as { result?: Result<object>; state?: Db; error?: string };
      if (!res.ok || !data.result) throw new Error(data.error || 'Could not save this change.');
      if (data.state) { kart.current = new Kart(data.state); setVersion(v => v + 1); }
      if (data.result.ok) { if (okText) toast(okText, 'ok'); }
      else toast(data.result.error, 'error');
      return data.result;
    } catch (error) {
      const result = { ok: false as const, error: error instanceof Error ? error.message : 'Could not save this change.' };
      toast(result.error, 'error');
      return result;
    }
  }, [sessionId, toast]);

  const signOut = useCallback(() => {
    setSessionId(null);
    kart.current = new Kart(emptyState());
    setVersion(v => v + 1);
  }, []);

  const refresh = useCallback(async () => {
    const user = kart.current.user(sessionId ?? '');
    if (user) await loadState(user);
  }, [loadState, sessionId]);

  const value: Ctx = { ready, k: kart.current, me, version, act, adopt: adoptUser, refresh, signOut, toasts };
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
