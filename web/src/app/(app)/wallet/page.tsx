'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { Button, Card, DataTable, Field, inputCls, kc, Notice, PageHead, Stat, StatGrid, when } from '@/components/ui';

export default function Wallet() {
  const { k, me, act } = useKart();
  const [amount, setAmount] = useState(500);
  if (!me) return null;
  const acct = `USER_WALLET:${me.id}`;
  const rows = k.ledger.entries.filter(e => e.postings.some(p => p.account === acct)).reverse().map(e => {
    const p = e.postings.find(x => x.account === acct)!;
    const signed = p.side === 'credit' ? p.amount : -p.amount;
    return { e, signed };
  });
  const escrow = k.db.tasks.filter(t => t.posterId === me.id && ['assigned', 'in_progress', 'review', 'disputed'].includes(t.status)).reduce((a, t) => a + k.ledger.balance(`TASK_ESCROW:${t.id}`), 0);
  const earned = rows.filter(r => r.e.type === 'escrow_release' && r.signed > 0).reduce((a, r) => a + r.signed, 0);
  const spent = rows.filter(r => r.signed < 0).reduce((a, r) => a - r.signed, 0);

  return (
    <>
      <PageHead kicker="KART CREDITS" title="KC Wallet" sub="Your balance is the sum of your ledger entries, never a separate number." />
      <Notice>This wallet holds simulated KC with no monetary value. Real top-ups and cash-outs will go through an existing PPI partner once it&apos;s connected.</Notice>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#163e30] p-6 text-white">
        <div><span className="text-[11px] text-[#bad2bf]">Available balance</span><strong className="my-1 block font-display text-4xl">{kc(k.balance(me.id))}</strong><small className="text-[#bdcfbe]">{kc(escrow)} currently held in escrow for your tasks</small></div>
        <form className="flex items-end gap-2" onSubmit={async e => { e.preventDefault(); await act(kart => kart.topUp(me, amount), 'Demo credits added'); }}>
          <Field label="Add demo credits"><input type="number" min={1} max={50000} className={`${inputCls} !w-32`} value={amount} onChange={e => setAmount(Number(e.target.value))} /></Field>
          <Button variant="gold" type="submit">Top up</Button>
        </form>
      </div>
      <StatGrid>
        <Stat label="Earned from tasks" value={kc(earned)} />
        <Stat label="Spent" value={kc(spent)} />
        <Stat label="In escrow" value={kc(escrow)} />
        <Stat label="Ledger entries" value={rows.length} />
      </StatGrid>
      <h2 className="mb-3 font-display text-lg font-bold">Statement</h2>
      {rows.length === 0 ? <Card>No activity yet.</Card> : (
        <DataTable head={['Entry', 'Description', 'Date', 'Amount']} rows={rows.map(({ e, signed }) => [
          <code key="i" className="text-[11px]">{e.id}</code>, <span key="m"><b>{e.memo}</b><br /><span className="text-muted">{e.type.replace('_', ' ')}</span></span>, when(e.ts),
          <b key="a" className={signed >= 0 ? 'text-[#338454]' : 'text-[#c46b48]'}>{signed >= 0 ? '+' : '−'}{kc(Math.abs(signed))}</b>,
        ])} />
      )}
    </>
  );
}
