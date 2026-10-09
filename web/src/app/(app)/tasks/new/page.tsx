'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { Button, Card, Field, inputCls, kc, Notice, PageHead } from '@/components/ui';
import { HORIZON_HOURS, netPayout, type TaskKind } from '@/lib/scoring';
import { FilePicker } from '@/components/FilePicker';
import type { FileLike } from '@/lib/attachments';

const KINDS: { id: TaskKind; label: string; hint: string }[] = [
  { id: 'urgent', label: '⚡ Short-term · urgent', hint: `Due within ${HORIZON_HOURS.urgent} hours, one delivery.` },
  { id: 'normal', label: 'Short-term · normal', hint: `Due within ${HORIZON_HOURS.normal} hours, one milestone.` },
  { id: 'long_term', label: 'Long-term', hint: 'More than 3 days, 2+ milestones, paid in stages.' },
];
const toLocal = (ms: number) => { const d = new Date(ms - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

export default function NewTask() {
  const { k, me, act } = useKart();
  const router = useRouter();
  const [kind, setKind] = useState<TaskKind>('normal');
  const [f, setF] = useState({ title: '', description: '', category: 'Digital', budget: 200, anonymous: false, deadline: toLocal(Date.now() + 24 * 3_600_000) });
  const [ms, setMs] = useState([{ title: 'Delivery', share: 100 }]);
  const [files, setFiles] = useState<FileLike[]>([]);
  const [startAt, setStartAt] = useState('');
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekly'>('none');
  const [times, setTimes] = useState(4);
  const [orderRef, setOrderRef] = useState('');
  const myOrders = me ? k.db.orders.filter(o => o.buyerId === me.id && o.status !== 'Cancelled') : [];

  const pickKind = (next: TaskKind) => {
    setKind(next);
    const hours = next === 'urgent' ? 4 : next === 'normal' ? 24 : 24 * 14;
    setF(x => ({ ...x, deadline: toLocal(Date.now() + hours * 3_600_000) }));
    if (next === 'urgent') setRepeat('none');
    setMs(next === 'long_term' ? [{ title: 'Milestone 1', share: 50 }, { title: 'Milestone 2', share: 50 }] : [{ title: 'Delivery', share: 100 }]);
  };
  const setShare = (i: number, share: number) => setMs(m => m.map((x, j) => (j === i ? { ...x, share } : x)));
  const total = ms.reduce((a, m) => a + (Number.isFinite(m.share) ? m.share : 0), 0);
  const { fee } = netPayout(f.budget, k.db.fees.taskFeeRate);

  return (
    <>
      <PageHead kicker="TASK BOARD" title="Post a task" sub="Money is held in escrow when you accept a bid and released as each milestone is approved." />
      <form className="grid max-w-3xl gap-4" onSubmit={async e => {
        e.preventDefault();
        const r = await act((kart, me) => kart.postTask(me, {
          ...f, kind, deadline: new Date(f.deadline).getTime(), milestones: ms, files,
          startAt: startAt ? new Date(startAt).getTime() : undefined,
          recurrence: repeat === 'none' ? undefined : { every: repeat, total: times },
          orderRef: orderRef || undefined,
        }), 'Task published');
        if (r.ok) router.push(`/tasks/${r.taskId}`);
      }}>
        <Card>
          <div role="radiogroup" aria-label="Task type" className="grid gap-3 sm:grid-cols-3">
            {KINDS.map(o => (
              <button key={o.id} type="button" role="radio" aria-checked={kind === o.id} onClick={() => pickKind(o.id)}
                className={`rounded-xl border p-3 text-left text-xs ${kind === o.id ? 'border-forest-800 bg-forest-100' : 'border-[#dce7dc]'}`}>
                <b className="block">{o.label}</b><span className="text-muted">{o.hint}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" wide><input required maxLength={80} className={inputCls} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="What do you need done?" /></Field>
            <Field label="Details" wide><textarea required maxLength={500} className={`${inputCls} min-h-24`} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="Describe the task and how you'll know it's done" /></Field>
            <Field label="Budget (KC)"><input type="number" min={1} max={100000} required className={inputCls} value={f.budget} onChange={e => setF({ ...f, budget: Number(e.target.value) })} /></Field>
            <Field label="Deadline"><input type="datetime-local" required className={inputCls} value={f.deadline} onChange={e => setF({ ...f, deadline: e.target.value })} /></Field>
            <Field label="Category"><select className={inputCls} value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{['Pickup', 'Delivery', 'Digital', 'Academic help', 'Other'].map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Visibility"><select className={inputCls} value={f.anonymous ? 'a' : 'p'} onChange={e => setF({ ...f, anonymous: e.target.value === 'a' })}><option value="p">Show my name</option><option value="a">Anonymous until I accept a bid</option></select></Field>
          </div>
        </Card>
        {kind !== 'urgent' && (
          <Card>
            <h2 className="mb-1 font-display text-base font-bold">Milestones</h2>
            <p className="mb-3 text-[11px] text-muted">Each milestone releases its share of the accepted bid when you approve it.</p>
            <div className="grid gap-2">
              {ms.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input aria-label={`Milestone ${i + 1} title`} required maxLength={60} className={inputCls} value={m.title} onChange={e => setMs(x => x.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} />
                  <input aria-label={`Milestone ${i + 1} share percent`} type="number" min={1} max={100} className={`${inputCls} max-w-[6rem]`} value={m.share} onChange={e => setShare(i, Number(e.target.value))} />
                  <span className="text-xs">%</span>
                  {kind === 'long_term' && ms.length > 2 && <Button type="button" size="sm" variant="secondary" aria-label={`Remove milestone ${i + 1}`} onClick={() => setMs(x => x.filter((_, j) => j !== i))}>×</Button>}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              {kind === 'long_term' && ms.length < 6 ? <Button type="button" size="sm" variant="secondary" onClick={() => setMs(m => [...m, { title: `Milestone ${m.length + 1}`, share: 0 }])}>+ Add milestone</Button> : <span />}
              <b className={total === 100 ? 'text-[#2f7a45]' : 'text-red-700'}>Total {total}%</b>
            </div>
          </Card>
        )}
        <Card>
          <h2 className="mb-1 font-display text-base font-bold">Extras <span className="text-[11px] font-medium text-muted">(optional)</span></h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><FilePicker files={files} onChange={setFiles} label="Attach briefs or references" /></div>
            <Field label="Don't start before"><input type="datetime-local" className={inputCls} value={startAt} onChange={e => setStartAt(e.target.value)} /></Field>
            <Field label="Link to one of my orders"><select className={inputCls} value={orderRef} onChange={e => setOrderRef(e.target.value)}><option value="">None</option>{myOrders.map(o => <option key={o.id} value={o.id}>{o.id} · {o.title.slice(0, 32)}</option>)}</select></Field>
            <Field label="Repeat"><select className={inputCls} value={repeat} disabled={kind === 'urgent'} onChange={e => setRepeat(e.target.value as 'none' | 'daily' | 'weekly')}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></Field>
            {repeat !== 'none' && <Field label="Total occurrences (2-12)"><input type="number" min={2} max={12} className={inputCls} value={times} onChange={e => setTimes(Number(e.target.value))} /></Field>}
          </div>
          <p className="mt-3 text-[11px] text-muted">A repeating task posts its next occurrence automatically after you approve the current one. Need several jobs in order? <Link className="font-bold text-forest-800 underline" href="/tasks/workflow">Build a linked workflow</Link>.</p>
        </Card>
        <Notice tone="green">The platform fee is {Math.round(k.db.fees.taskFeeRate * 100)}% and is taken from the provider&apos;s payout (about {kc(fee)} on {kc(f.budget)}). Your wallet balance is {kc(k.balance(me?.id ?? ''))}.</Notice>
        <div><Button type="submit">Publish task</Button></div>
      </form>
    </>
  );
}
