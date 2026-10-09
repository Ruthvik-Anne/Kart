'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { Button, Card, Field, inputCls, Notice, PageHead } from '@/components/ui';

const pct = (n: number) => String(Math.round(n * 1000) / 10);

export default function Fees() {
  const { k, me, act } = useKart();
  const [fees, setFees] = useState({ task: pct(k.db.fees.taskFeeRate), vendor: pct(k.db.fees.vendorCommissionRate) });
  const [pw, setPw] = useState(Object.fromEntries(Object.entries(k.db.priorityWeights).map(([a, b]) => [a, pct(b)])));
  const [mw, setMw] = useState(Object.fromEntries(Object.entries(k.db.matchWeights).map(([a, b]) => [a, pct(b)])));
  if (!me) return null;
  const num = (s: string) => Number(s) / 100;
  const sum = (o: Record<string, string>) => Object.values(o).reduce((a, b) => a + Number(b), 0);

  const group = (title: string, state: Record<string, string>, set: (v: Record<string, string>) => void) => (
    <Card>
      <h2 className="mb-1 font-display text-base font-bold">{title}</h2>
      <p className={`mb-3 text-[11px] ${Math.round(sum(state)) === 100 ? 'text-muted' : 'font-bold text-red-700'}`}>Weights (%) must total 100. Now: {sum(state)}</p>
      <div className="grid grid-cols-2 gap-3">{Object.keys(state).map(key => (
        <Field key={key} label={key}><input type="number" min={0} max={100} className={inputCls} value={state[key]} onChange={e => set({ ...state, [key]: e.target.value })} /></Field>))}</div>
    </Card>
  );

  return (
    <>
      <PageHead kicker="PLATFORM ADMIN" title="Fees & scoring weights" sub="Changes apply to new transactions and to every score immediately." />
      <Notice>Fees are placeholders for the demo. Commission and settlement terms must follow the payment partner&apos;s regulatory arrangement.</Notice>
      <form className="grid max-w-3xl gap-4" onSubmit={async e => {
        e.preventDefault();
        const toNum = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([a, b]) => [a, num(b)]));
        await act(kart => kart.setFees(me, { taskFeeRate: num(fees.task), vendorCommissionRate: num(fees.vendor) }, toNum(pw) as never, toNum(mw) as never), 'Saved');
      }}>
        <Card>
          <h2 className="mb-3 font-display text-base font-bold">Fees</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Task fee (% of payout, max 30)"><input type="number" step="0.5" min={0} max={30} className={inputCls} value={fees.task} onChange={e => setFees({ ...fees, task: e.target.value })} /></Field>
            <Field label="Vendor commission (%, max 30)"><input type="number" step="0.5" min={0} max={30} className={inputCls} value={fees.vendor} onChange={e => setFees({ ...fees, vendor: e.target.value })} /></Field>
          </div>
        </Card>
        {group('Task priority weights', pw, setPw)}
        {group('Provider match weights', mw, setMw)}
        <div><Button type="submit">Save changes</Button></div>
      </form>
    </>
  );
}
