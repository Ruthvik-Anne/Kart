'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { Button, Card, DataTable, Field, inputCls, kc, Notice, PageHead, Stat, StatGrid, when, cx } from '@/components/ui';

const QUICK_AMOUNTS = [100, 500, 1000, 2000, 5000];

export default function Wallet() {
  const { k, me, act } = useKart();
  const [amount, setAmount] = useState(500);
  const [busy, setBusy] = useState(false);

  if (!me) return null;

  const acct = `USER_WALLET:${me.id}`;
  const rows = k.ledger.entries
    .filter(e => e.postings.some(p => p.account === acct))
    .reverse()
    .map(e => {
      const p = e.postings.find(x => x.account === acct)!;
      const signed = p.side === 'credit' ? p.amount : -p.amount;
      return { e, signed };
    });

  const escrow = k.db.tasks
    .filter(t => t.posterId === me.id && ['assigned', 'in_progress', 'review', 'disputed'].includes(t.status))
    .reduce((a, t) => a + k.ledger.balance(`TASK_ESCROW:${t.id}`), 0);
  const earned = rows.filter(r => r.e.type === 'escrow_release' && r.signed > 0).reduce((a, r) => a + r.signed, 0);
  const spent  = rows.filter(r => r.signed < 0).reduce((a, r) => a - r.signed, 0);
  const balance = k.balance(me.id);

  return (
    <>
      <PageHead kicker="KART CREDITS" title="KC Wallet" sub="Your balance is the live sum of your ledger — never a separate counter." />

      <Notice tone="amber" icon="ℹ">
        This wallet holds simulated KC with no monetary value. Real top-ups will go through an existing PPI partner once connected.
      </Notice>

      {/* Hero balance card */}
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-6 text-cream-50 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[2px] text-brand-200">Available balance</p>
            <strong className="my-2 block font-display text-5xl font-bold leading-none">{kc(balance)}</strong>
            {escrow > 0 && (
              <p className="text-[11px] text-brand-200">
                <span className="font-bold text-gold-400">{kc(escrow)}</span> held in escrow for your tasks
              </p>
            )}
          </div>

          {/* Top up panel */}
          <div className="w-full rounded-xl border border-brand-700 bg-brand-800/50 p-4 sm:w-auto">
            <p className="mb-2.5 text-[11px] font-bold text-brand-200">Add demo credits</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_AMOUNTS.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAmount(a)}
                  className={cx(
                    'rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-all',
                    amount === a
                      ? 'bg-gold-500 text-brand-950'
                      : 'border border-brand-600 text-brand-200 hover:border-gold-500 hover:text-gold-400',
                  )}
                >
                  {a.toLocaleString('en-IN')}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                max={50000}
                aria-label="Top-up amount"
                className="w-24 rounded-xl border border-brand-600 bg-brand-800 px-3 py-2 text-xs font-medium text-cream-50 placeholder:text-brand-400 focus:border-gold-500 focus:outline-none"
                value={amount}
                onChange={e => setAmount(Number(e.target.value))}
              />
              <Button
                variant="gold"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  await act(kart => kart.topUp(me, amount), `Added ${kc(amount)} to your wallet`);
                  setBusy(false);
                }}
              >
                Top up
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <StatGrid>
        <Stat label="Earned from tasks" value={kc(earned)} icon="⚡" />
        <Stat label="Total spent"        value={kc(spent)}  icon="🛍️" />
        <Stat label="In escrow"          value={kc(escrow)} icon="🔒" />
        <Stat label="Transactions"       value={rows.length} icon="📋" />
      </StatGrid>

      {/* Statement */}
      <h2 className="mb-3 font-display text-lg font-bold">Statement</h2>
      {rows.length === 0
        ? <Card>No activity yet. Top up and start exploring!</Card>
        : (
          <DataTable
            head={['Entry', 'Description', 'Date', 'Amount']}
            rows={rows.map(({ e, signed }) => [
              <code key="i" className="text-[10px] text-muted">{e.id}</code>,
              <span key="m">
                <b className="text-xs">{e.memo}</b>
                <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold text-muted uppercase">
                  {e.type.replace('_', ' ')}
                </span>
              </span>,
              <span key="d" className="text-xs text-muted">{when(e.ts)}</span>,
              <b key="a" className={cx('text-xs font-bold', signed >= 0 ? 'text-success-700' : 'text-danger-700')}>
                {signed >= 0 ? '+' : '−'}{kc(Math.abs(signed))}
              </b>,
            ])}
          />
        )}
    </>
  );
}
