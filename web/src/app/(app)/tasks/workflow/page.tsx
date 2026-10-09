'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { Button, Card, Field, inputCls, kc, Notice, PageHead } from '@/components/ui';
import type { WorkflowStepDraft } from '@/mock/db';

const CATEGORIES = ['Pickup', 'Delivery', 'Digital', 'Academic help', 'Other'];
const blank = (title = ''): WorkflowStepDraft => ({ title, description: '', category: 'Pickup', budget: 80, hours: 2 });

export default function WorkflowBuilder() {
  const { k, me, act } = useKart();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [steps, setSteps] = useState<WorkflowStepDraft[]>([blank('Collect the items'), { ...blank('Deliver to me'), category: 'Delivery', budget: 60 }]);
  const set = (i: number, patch: Partial<WorkflowStepDraft>) => setSteps(s => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const total = steps.reduce((a, s) => a + (Number.isFinite(s.budget) ? s.budget : 0), 0);
  const hours = steps.reduce((a, s) => a + (Number.isFinite(s.hours) ? s.hours : 0), 0);
  const myOrders = me ? k.db.orders.filter(o => o.buyerId === me.id && o.status !== 'Cancelled') : [];

  return (
    <>
      <PageHead kicker="TASK BOARD" title="Linked workflow" sub="Chain jobs together, such as buy stationery then deliver it. Each step opens for bids when the previous one is completed." />
      <form className="grid max-w-3xl gap-4" onSubmit={async e => {
        e.preventDefault();
        const r = await act((kart, user) => kart.createWorkflow(user, { title, steps, orderRef: orderRef || undefined }), 'Workflow created');
        if (r.ok) router.push('/my-tasks');
      }}>
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Workflow name"><input required maxLength={80} className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Stationery run" /></Field>
            <Field label="Link to one of my orders"><select className={inputCls} value={orderRef} onChange={e => setOrderRef(e.target.value)}><option value="">None</option>{myOrders.map(o => <option key={o.id} value={o.id}>{o.id} · {o.title.slice(0, 32)}</option>)}</select></Field>
          </div>
        </Card>
        {steps.map((st, i) => (
          <Card key={i}>
            <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-base font-bold">Step {i + 1}</h2>
              {steps.length > 2 && <Button type="button" size="sm" variant="secondary" onClick={() => setSteps(s => s.filter((_, j) => j !== i))}>Remove</Button>}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="What needs doing" wide><input required maxLength={80} className={inputCls} value={st.title} onChange={e => set(i, { title: e.target.value })} /></Field>
              <Field label="Details" wide><textarea required maxLength={500} className={`${inputCls} min-h-16`} value={st.description} onChange={e => set(i, { description: e.target.value })} /></Field>
              <Field label="Category"><select className={inputCls} value={st.category} onChange={e => set(i, { category: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Budget (KC)"><input type="number" min={1} max={100000} required className={inputCls} value={st.budget} onChange={e => set(i, { budget: Number(e.target.value) })} /></Field>
              <Field label="Hours this step may take"><input type="number" min={1} max={72} required className={inputCls} value={st.hours} onChange={e => set(i, { hours: Number(e.target.value) })} /></Field>
            </div>
          </Card>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          {steps.length < 4 && <Button type="button" variant="secondary" onClick={() => setSteps(s => [...s, blank()])}>+ Add step</Button>}
          <span className={`text-xs font-bold ${hours > 72 ? 'text-red-700' : 'text-muted'}`}>{hours} h of 72 h · {kc(total)} total</span>
        </div>
        <Notice tone="green">Your wallet must hold {kc(total)} to cover every step ({kc(k.balance(me?.id ?? ''))} available). Money is only held in escrow when you accept a bid on a step. If a step is cancelled, the later steps that haven&apos;t started are cancelled with it.</Notice>
        <div><Button type="submit">Create workflow</Button></div>
      </form>
    </>
  );
}
