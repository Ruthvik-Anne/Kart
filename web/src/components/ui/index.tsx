'use client';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
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

/* ─── Button ──────────────────────────────────────────────────────────────── */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'gold' | 'danger' | 'ghost';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = 'primary', size = 'md', className, loading, disabled, icon, children, ...p }: BtnProps) {
  const v = {
    primary:   'bg-brand-900 text-cream-50 hover:bg-brand-800 active:bg-brand-950 shadow-sm',
    secondary: 'border border-line bg-surface text-brand-900 hover:bg-brand-50 active:bg-brand-100',
    gold:      'bg-gold-500 text-brand-950 hover:bg-gold-600 active:bg-gold-700 shadow-sm',
    danger:    'bg-danger-700 text-white hover:opacity-90 active:opacity-80',
    ghost:     'text-brand-800 hover:bg-brand-50 active:bg-brand-100',
  }[variant];

  const s = {
    xs: 'px-2.5 py-1.5 text-[10px] rounded-lg gap-1',
    sm: 'px-3 py-2 text-[11px] rounded-xl gap-1.5',
    md: 'px-4 py-2.5 text-xs rounded-xl gap-2',
    lg: 'px-5 py-3 text-sm rounded-2xl gap-2',
  }[size];

  return (
    <button
      {...p}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center font-bold whitespace-nowrap',
        'transition-all duration-150 select-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        s, v, className
      )}
    >
      {loading ? <SpinnerIcon size={size === 'lg' ? 16 : 14} /> : icon}
      {children}
    </button>
  );
}

/* ─── Spinner ─────────────────────────────────────────────────────────────── */
function SpinnerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4" strokeDashoffset="12" />
    </svg>
  );
}

/* ─── Card ────────────────────────────────────────────────────────────────── */
export function Card({ children, className, as: Tag = 'section', hover }: { children: ReactNode; className?: string; as?: 'section' | 'article' | 'div'; hover?: boolean }) {
  return (
    <Tag className={cx(
      'rounded-2xl border border-line bg-surface',
      hover && 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-brand-200',
      'p-5', className
    )}>
      {children}
    </Tag>
  );
}

/* ─── Badge ───────────────────────────────────────────────────────────────── */
const TONES = {
  green:  'bg-success-100 text-success-700 border border-success-100',
  amber:  'bg-warning-100 text-warning-700 border border-warning-100',
  blue:   'bg-info-100 text-info-700 border border-info-100',
  red:    'bg-danger-100 text-danger-700 border border-danger-100',
  gray:   'bg-surface-2 text-muted border border-line',
  gold:   'bg-gold-100 text-gold-700 border border-gold-100',
  cream:  'bg-cream-100 text-cream-900 border border-cream-300',
};
export function Badge({ children, tone = 'green', dot }: { children: ReactNode; tone?: keyof typeof TONES; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide', TONES[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

/* ─── PageHead ────────────────────────────────────────────────────────────── */
export function PageHead({ kicker, title, sub, action }: { kicker: string; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[2px] text-gold-600">
          <span className="h-px w-4 bg-gold-500 inline-block" />
          {kicker}
        </div>
        <h1 className="mt-1.5 font-display text-[28px] font-bold tracking-tight text-ink leading-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted leading-relaxed">{sub}</p>}
      </div>
      {action && <div className="flex items-center gap-2 flex-shrink-0">{action}</div>}
    </div>
  );
}

/* ─── Stat ────────────────────────────────────────────────────────────────── */
export function Stat({ label, value, note, icon, accent }: { label: string; value: ReactNode; note?: string; icon?: string; accent?: boolean }) {
  return (
    <div className={cx(
      'rounded-2xl border p-5 transition-all duration-200',
      accent
        ? 'border-brand-700 bg-brand-900 text-cream-50'
        : 'border-line bg-surface hover:border-brand-200 hover:shadow-sm'
    )}>
      <div className={cx('flex items-center justify-between', accent ? 'text-brand-200' : 'text-muted')}>
        <span className="text-[11px] font-medium">{label}</span>
        {icon && <span className="text-base opacity-70" aria-hidden>{icon}</span>}
      </div>
      <div className={cx('mt-2 font-display text-2xl font-bold leading-none', accent ? 'text-cream-50' : 'text-ink')}>{value}</div>
      {note && <div className={cx('mt-1.5 text-[10px] font-medium', accent ? 'text-brand-200' : 'text-muted')}>{note}</div>}
    </div>
  );
}

export const StatGrid = ({ children }: { children: ReactNode }) => <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 animate-fade-in">{children}</div>;
export const CardGrid = ({ children }: { children: ReactNode }) => <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;

/* ─── Empty ───────────────────────────────────────────────────────────────── */
export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface-2 px-8 py-12 text-center animate-fade-in">
      {icon && <div className="mb-3 text-4xl opacity-40" aria-hidden>{icon}</div>}
      <strong className="block font-display text-lg font-bold text-ink">{title}</strong>
      {children && <div className="mt-2 text-sm text-muted leading-relaxed">{children}</div>}
    </div>
  );
}

/* ─── Notice ──────────────────────────────────────────────────────────────── */
export function Notice({ children, tone = 'amber', icon }: { children: ReactNode; tone?: 'amber' | 'red' | 'green' | 'blue'; icon?: string }) {
  const t = {
    amber: 'border-gold-100 bg-gold-50 text-gold-700',
    red:   'border-danger-100 bg-danger-100 text-danger-700',
    green: 'border-success-100 bg-success-100 text-success-700',
    blue:  'border-info-100 bg-info-100 text-info-700',
  }[tone];
  return (
    <div role="note" className={cx('mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-xs leading-relaxed', t)}>
      {icon && <span className="mt-0.5 flex-none text-base" aria-hidden>{icon}</span>}
      <div>{children}</div>
    </div>
  );
}

/* ─── Tabs ────────────────────────────────────────────────────────────────── */
export function Tabs<T extends string>({ tabs, value, onChange, pill }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; pill?: boolean }) {
  if (pill) {
    return (
      <div role="tablist" className="mb-5 flex flex-wrap gap-2">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
            className={cx(
              'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-150',
              value === t.id
                ? 'bg-brand-900 text-cream-50 shadow-sm'
                : 'bg-surface-2 text-muted hover:bg-brand-50 hover:text-brand-900'
            )}>
            {t.label}
            {t.count !== undefined && (
              <span className={cx('rounded-full px-1.5 py-0.5 text-[9px] font-bold', value === t.id ? 'bg-brand-700 text-cream-50' : 'bg-line text-muted')}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div role="tablist" className="mb-5 flex flex-wrap gap-0 border-b border-line">
      {tabs.map(t => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx(
            'relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all duration-150',
            value === t.id
              ? 'text-brand-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gold-500 after:rounded-full'
              : 'text-muted hover:text-brand-800'
          )}>
          {t.label}
          {t.count !== undefined && (
            <span className={cx('rounded-full px-1.5 py-0.5 text-[9px] font-bold', value === t.id ? 'bg-brand-100 text-brand-900' : 'bg-surface-2 text-muted')}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ─── Modal ───────────────────────────────────────────────────────────────── */
export function Modal({ title, onClose, children, wide, subtitle }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; subtitle?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && box.current) {
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
    <div className="fixed inset-0 z-40 grid place-items-center bg-brand-950/60 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={title}
        className={cx('max-h-[90vh] w-full overflow-auto rounded-2xl bg-surface shadow-2xl animate-slide-up', wide ? 'max-w-2xl' : 'max-w-lg')}>
        <div className="flex items-start justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button data-close aria-label="Close dialog" onClick={onClose}
            className="ml-4 grid h-8 w-8 flex-none place-items-center rounded-xl border border-line text-muted hover:bg-surface-2 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

/* ─── Field ───────────────────────────────────────────────────────────────── */
export function Field({ label, children, wide, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return (
    <label className={cx('grid gap-1.5', wide && 'sm:col-span-2')}>
      <span className="text-[11px] font-bold text-muted uppercase tracking-wide">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls = [
  'w-full rounded-xl border border-line bg-surface',
  'px-3 py-2.5 text-xs font-medium text-ink',
  'placeholder:text-muted-2',
  'transition-colors duration-150',
  'focus:border-brand-700 focus:ring-1 focus:ring-brand-700/30 focus:outline-none',
].join(' ');

/* ─── Can ─────────────────────────────────────────────────────────────────── */
export function Can({ perm, resource, fallback = null, children }: { perm: Permission; resource?: Resource; fallback?: ReactNode; children: ReactNode }) {
  const { me } = useKart();
  return <>{can(me, perm, resource) ? children : fallback}</>;
}

/* ─── ScoreChip ───────────────────────────────────────────────────────────── */
export function ScoreChip({ score, label, parts }: { score: number; label: string; parts: Record<string, number> }) {
  const tone = score >= 70 ? 'bg-success-100 text-success-700' : score >= 45 ? 'bg-warning-100 text-warning-700' : 'bg-surface-2 text-muted';
  const detail = Object.entries(parts).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · ');
  return (
    <span tabIndex={0} title={detail} aria-label={`${label} ${score} out of 100. ${detail}`}
      className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold', tone)}>
      {label} {Math.round(score)}
    </span>
  );
}

/* ─── Stepper ─────────────────────────────────────────────────────────────── */
export function Stepper({ steps }: { steps: { label: string; state: 'done' | 'current' | 'todo'; note?: string }[] }) {
  return (
    <ol className="flex items-center gap-0">
      {steps.map((s, i) => (
        <li key={i} className="flex flex-1 items-center">
          <div className="flex items-center gap-1.5">
            <span className={cx(
              'grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold flex-none transition-colors',
              s.state === 'done'    ? 'bg-brand-900 text-cream-50' :
              s.state === 'current' ? 'bg-gold-500 text-brand-950 shadow-sm' :
                                     'bg-line text-muted'
            )}>
              {s.state === 'done' ? '✓' : i + 1}
            </span>
            <span className={cx('text-[10px] font-medium whitespace-nowrap', s.state === 'todo' ? 'text-muted' : 'text-ink font-bold')}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={cx('flex-1 h-px mx-2 transition-colors', s.state === 'done' ? 'bg-brand-900' : 'bg-line')} />
          )}
        </li>
      ))}
    </ol>
  );
}

/* ─── DataTable ───────────────────────────────────────────────────────────── */
export function DataTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-line bg-surface-2">
            {head.map(h => <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line transition-colors hover:bg-surface-2">
              {r.map((c, j) => <td key={j} className="px-4 py-3 align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── QuickAction ─────────────────────────────────────────────────────────── */
export function QuickAction({ icon, label, onClick, disabled, variant = 'secondary' }: {
  icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'gold';
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={cx(
        'flex flex-col items-center gap-1.5 rounded-2xl border p-4 text-center transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' ? 'border-brand-700 bg-brand-900 text-cream-50 hover:bg-brand-800' :
        variant === 'gold'    ? 'border-gold-500 bg-gold-50 text-gold-700 hover:bg-gold-100' :
                               'border-line bg-surface text-ink hover:bg-surface-2 hover:border-brand-200',
      )}>
      <span className="text-2xl">{icon}</span>
      <span className="text-[10px] font-bold leading-tight">{label}</span>
    </button>
  );
}

/* ─── Pill / status tag ───────────────────────────────────────────────────── */
export function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-success-700', open: 'bg-success-700', Placed: 'bg-info-700',
    Preparing: 'bg-warning-700', Ready: 'bg-gold-500', Collected: 'bg-muted',
    Cancelled: 'bg-danger-700', cancelled: 'bg-danger-700', completed: 'bg-muted',
    sold: 'bg-muted', reserved: 'bg-warning-700', approved: 'bg-success-700',
  };
  return <span className={cx('inline-block h-2 w-2 rounded-full flex-none', map[status] ?? 'bg-muted')} />;
}

/* ─── InlineEdit ──────────────────────────────────────────────────────────── */
export function InlineEdit({ value, onSave, type = 'text', min, max }: { value: string | number; onSave: (v: string) => void; type?: string; min?: number; max?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <input
      ref={ref}
      type={type}
      defaultValue={value}
      min={min}
      max={max}
      className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-inherit transition-colors hover:border-line focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700/30"
      onBlur={e => onSave(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') ref.current?.blur(); }}
    />
  );
}
