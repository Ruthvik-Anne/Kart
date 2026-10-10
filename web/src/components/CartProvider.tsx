'use client';
// Shared shopping cart, kept per signed-in user in localStorage so it survives navigation and reloads.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import type { CartLine } from '@/mock/db';

const KEY = 'kart-web-cart-v1';

interface CartCtx {
  lines: CartLine[];
  count: number;
  qtyOf: (productId: string) => number;
  add: (productId: string, qty?: number) => boolean;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}

const Ctx = createContext<CartCtx | null>(null);

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used inside <CartProvider>');
  return c;
}

function load(userId: string): CartLine[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, CartLine[]>;
    const mine = all[userId];
    return Array.isArray(mine) ? mine.filter(l => typeof l?.productId === 'string' && Number.isInteger(l.qty) && l.qty > 0) : [];
  } catch { return []; }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { k, me, version } = useKart();
  const userId = me?.id ?? '';
  const [raw, setRaw] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [loadedFor, setLoadedFor] = useState('');

  useEffect(() => { setRaw(userId ? load(userId) : []); setLoadedFor(userId); setOpen(false); }, [userId]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === KEY && userId) setRaw(load(userId)); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  const persist = useCallback((next: CartLine[]) => {
    setRaw(next);
    if (!userId) return;
    try {
      const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, CartLine[]>;
      all[userId] = next;
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* storage unavailable: the cart lives for this tab only */ }
  }, [userId]);

  // Drop lines for products that no longer exist and clamp to current stock, so checkout never sees stale data.
  const lines = useMemo(() => {
    void version;
    return raw.flatMap(l => {
      const p = k.db.products.find(x => x.id === l.productId);
      if (!p || p.stock <= 0) return [];
      return [{ productId: l.productId, qty: Math.min(l.qty, p.stock, 50) }];
    });
  }, [raw, k, version]);

  const add = useCallback((productId: string, qty = 1) => {
    const p = k.db.products.find(x => x.id === productId);
    if (!p) return false;
    const cur = lines.find(l => l.productId === productId)?.qty ?? 0;
    if (cur + qty > Math.min(p.stock, 50)) return false;
    persist(cur ? lines.map(l => (l.productId === productId ? { ...l, qty: cur + qty } : l)) : [...lines, { productId, qty }]);
    return true;
  }, [k, lines, persist]);

  const setQty = useCallback((productId: string, qty: number) => {
    persist(qty <= 0 ? lines.filter(l => l.productId !== productId) : lines.map(l => (l.productId === productId ? { ...l, qty } : l)));
  }, [lines, persist]);

  const value: CartCtx = {
    lines, count: lines.reduce((a, l) => a + l.qty, 0), open, setOpen,
    qtyOf: id => lines.find(l => l.productId === id)?.qty ?? 0,
    add, setQty, clear: () => persist([]),
  };
  return <Ctx.Provider value={loadedFor === userId ? value : { ...value, lines: [], count: 0 }}>{children}</Ctx.Provider>;
}
