'use client';
import { useEffect, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import type { Permission, Resource } from '@/rbac/policy';
import { can } from '@/rbac/policy';
import { useKart } from '@/mock/StoreProvider';

export const kc = (n: number) => `${n.toLocaleString('en-IN')} KC`;
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export const when = (ts: number) => new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export function timeLeft(ts: number, now = Date.now()) {
  const h = (ts - now) / 3_600_000;
  if (h <= 0) return 'overdue';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min left`;
  if (h < 48) return `${Math.round(h)} h left`;
  return `${Math.round(h / 24)} days left`;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'gold' | 'danger'; size?: 'sm' | 'md' };
export function Button({ variant = 'primary', size = 'md', className, ...p }: BtnProps) {
  const v = {
    primary: 'bg-forest-800 text-white hover:bg-forest-950',
    secondary: 'border border-[#dce7dc] bg-white text-forest-800 hover:bg-forest-100',
    gold: 'bg-amber-kart text-forest-950 hover:brightness-95',
    danger: 'bg-red-700 text-white hover:bg-red-800',
  }[variant];
  return <button {...p} className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-extrabold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50', size === 'sm' ? 'px-3 py-2 text-[11px]' : 'px-4 py-2.5 text-xs', v, className)} />;
}

export function Card({ children, className, ...rest }: Omit<HTMLAttributes<HTMLElement>, 'children'> & { children: ReactNode; className?: string }) {
  return <section {...rest} className={cx('rounded-2xl border border-line bg-white p-5', className)}>{children}</section>;
}

const TONES = { green: 'bg-forest-100 text-[#3e7c45]', amber: 'bg-[#fff1d7] text-[#a66f1e]', blue: 'bg-[#eaf0fb] text-[#4972a9]', red: 'bg-[#fde8e8] text-[#b42318]', gray: 'bg-[#eef1ed] text-[#5d6f63]' };
export function Badge({ children, tone = 'green' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={cx('inline-block whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-extrabold', TONES[tone])}>{children}</span>;
}

export function PageHead({ kicker, title, sub, action }: { kicker: string; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-widest text-[#5d8369]">{kicker}</div>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold">{value}</div>
      {note && <div className="mt-0.5 text-[10px] font-bold text-[#6b9b70]">{note}</div>}
    </div>
  );
}

export const StatGrid = ({ children }: { children: ReactNode }) => <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">{children}</div>;
export const CardGrid = ({ children }: { children: ReactNode }) => <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#cbd9ce] p-8 text-center text-sm text-muted">
      <strong className="mb-1 block font-display text-lg text-[#2b4c37]">{title}</strong>{children}
    </div>
  );
}

export function Notice({ children, tone = 'amber' }: { children: ReactNode; tone?: 'amber' | 'red' | 'green' }) {
  const t = { amber: 'border-[#f1ddb0] bg-[#fff5dc] text-[#806528]', red: 'border-red-200 bg-red-50 text-red-800', green: 'border-[#cfe6d2] bg-forest-100 text-[#2f6a41]' }[tone];
  return <div role="note" className={cx('mb-5 rounded-xl border px-4 py-3 text-xs leading-relaxed', t)}>{children}</div>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="mb-5 flex flex-wrap gap-1 border-b border-[#e1e9df]">
      {tabs.map(t => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('border-b-2 px-4 py-2.5 text-xs font-extrabold', value === t.id ? 'border-[#2e6a48] text-[#27543c]' : 'border-transparent text-[#77907b]')}>{t.label}</button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && box.current) { // keep focus inside the dialog
        const f = [...box.current.querySelectorAll<HTMLElement>('input,select,textarea,button,a[href]')].filter(el => !el.hasAttribute('disabled'));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-[#0c261b99] p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={title} className={cx('max-h-[90vh] w-full overflow-auto rounded-2xl bg-white shadow-2xl', wide ? 'max-w-2xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button data-close aria-label="Close dialog" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-line text-lg">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={cx('grid gap-1.5 text-[11px] font-extrabold text-[#55715b]', wide && 'sm:col-span-2')}>{label}{children}</label>;
}
export const inputCls = 'w-full rounded-xl border border-[#dce7db] bg-white px-3 py-2.5 text-xs font-medium text-[#243b2d]';

/** Hide children unless the current user holds the permission (UX only; the mock layer enforces it too). */
export function Can({ perm, resource, fallback = null, children }: { perm: Permission; resource?: Resource; fallback?: ReactNode; children: ReactNode }) {
  const { me } = useKart();
  return <>{can(me, perm, resource) ? children : fallback}</>;
}

export function ScoreChip({ score, label, parts }: { score: number; label: string; parts: Record<string, number> }) {
  const tone = score >= 70 ? 'bg-[#e3f3e6] text-[#2f7a45]' : score >= 45 ? 'bg-[#fff1d7] text-[#a66f1e]' : 'bg-[#eef1ed] text-[#5d6f63]';
  const detail = Object.entries(parts).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · ');
  return (
    <span tabIndex={0} title={detail} aria-label={`${label} ${score} out of 100. ${detail}`} className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold', tone)}>
      {label} {Math.round(score)}
    </span>
  );
}

export function Stepper({ steps }: { steps: { label: string; state: 'done' | 'current' | 'todo'; note?: string }[] }) {
  return (
    <ol className="grid gap-2">
      {steps.map((s, i) => (
        <li key={i} className="flex items-center gap-3 text-xs">
          <span className={cx('grid h-6 w-6 place-items-center rounded-full text-[10px] font-extrabold', s.state === 'done' ? 'bg-forest-800 text-white' : s.state === 'current' ? 'bg-amber-kart text-forest-950' : 'bg-[#eef1ed] text-[#8b9b8e]')}>{s.state === 'done' ? '✓' : i + 1}</span>
          <span className={s.state === 'todo' ? 'text-muted' : 'font-bold'}>{s.label}</span>
          {s.note && <span className="ml-auto text-[10px] text-muted">{s.note}</span>}
        </li>
      ))}
    </ol>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full border-collapse text-xs">
        <thead><tr>{head.map(h => <th key={h} className="bg-[#fafbf9] px-4 py-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#8b9b8e]">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-[#eff2ed]">{r.map((c, j) => <td key={j} className="px-4 py-3 align-top">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
