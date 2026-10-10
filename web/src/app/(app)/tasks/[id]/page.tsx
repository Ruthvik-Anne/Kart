'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { KIND_LABEL, KIND_TONE, STATUS_TONE, statusLabel } from '@/components/TaskCard';
import { ChatThread } from '@/components/ChatThread';
import { Badge, Button, Card, Empty, Field, inputCls, kc, Modal, Notice, ScoreChip, Stepper, timeLeft, when } from '@/components/ui';
import { can } from '@/rbac/policy';
import { netPayout } from '@/lib/scoring';
import { AttachmentList, FilePicker } from '@/components/FilePicker';
import { StarRating } from '@/components/StarRating';
import type { FileLike } from '@/lib/attachments';

export default function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { k, me, act } = useKart();
  const t = k.task(id);
  const [bid, setBid] = useState({ amount: t?.budget ?? 0, etaHours: 4, note: '' });
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'dispute' | 'changes' | 'submit'>(null);
  const [files, setFiles] = useState<FileLike[]>([]);
  const [stars, setStars] = useState(5);
  const [review, setReview] = useState('');
  const [reason, setReason] = useState('');

  if (!t || !me) return <Empty title="Task not found"><Link href="/tasks" className="font-bold underline">Back to the board</Link></Empty>;

  const isPoster = t.posterId === me.id;
  const isAssignee = t.assigneeId === me.id;
  const open = ['open', 'bidding'].includes(t.status);
  const myBid = t.bids.find(b => b.providerId === me.id);
  const pr = k.priority(t);
  const ranked = t.bids.map(b => ({ b, m: k.match(t, b) })).sort((a, c) => c.m.score - a.m.score);
  const held = k.ledger.balance(`TASK_ESCROW:${t.id}`);
  const nameOf = (uid: string) => k.user(uid)?.name ?? 'Unknown';
  const canDispute = (isPoster || isAssignee) && ['assigned', 'in_progress', 'review'].includes(t.status);
  const adminView = can(me, 'dispute:resolve');
  const locked = k.isLocked(t);
  const scheduled = !!t.startAt && t.startAt > Date.now();
  const flow = t.workflowId ? k.db.workflows.find(w => w.id === t.workflowId) : undefined;
  const mayReview = (isPoster || isAssignee) && t.status === 'completed' && !k.db.reviews.some(r => r.kind === 'task' && r.refId === t.id && r.fromId === me.id);
  const reviewTarget = isPoster ? nameOf(t.assigneeId ?? '') : nameOf(t.posterId);
  const myReview = k.db.reviews.find(r => r.kind === 'task' && r.refId === t.id && r.fromId === me.id);
  const theirReview = k.db.reviews.find(r => r.kind === 'task' && r.refId === t.id && r.toId === me.id);

  // Threads this viewer may open: poster sees one per bidder, a bidder sees their own, admins only the assignee's during a dispute.
  const threads = isPoster ? t.bids.map(b => b.providerId) : myBid ? [me.id] : (adminView && t.status === 'disputed' && t.assigneeId) ? [t.assigneeId] : [];
  const current = activeKey ?? (threads.length ? `${t.id}:${t.assigneeId && threads.includes(t.assigneeId) ? t.assigneeId : threads[0]}` : null);
  const currentBidder = current?.split(':')[1] ?? '';
  const closedThread = !!t.assigneeId && currentBidder !== t.assigneeId;

  const doneMs = t.milestones.filter(m => m.status === 'released').length;
  const steps = t.milestones.map((m, i) => ({
    label: `${m.title} (${m.share}%)`,
    state: m.status === 'released' ? 'done' as const : (i === doneMs && ['in_progress', 'review', 'assigned'].includes(t.status)) ? 'current' as const : 'todo' as const,
    note: m.amount ? `${kc(m.amount)} · ${m.status}` : m.status,
  }));
  const canAfford = (amount: number) => k.balance(me.id) >= amount;

  return (
    <>
      <Link href="/tasks" className="mb-4 inline-block text-xs font-bold text-brand-900">← Task board</Link>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={KIND_TONE[t.kind]}>{t.kind === 'urgent' ? '⚡ ' : ''}{KIND_LABEL[t.kind]}</Badge>
              <Badge tone={STATUS_TONE[t.status]}>{statusLabel(t.status)}</Badge>
              <Badge tone="gray">{t.category}</Badge>
              <span className="ml-auto"><ScoreChip score={pr.score} label="Priority" parts={pr.parts} /></span>
            </div>
            <h1 className="mt-3 font-display text-2xl font-bold">{t.title}</h1>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-x4c6354">{t.description}</p>
            <AttachmentList files={t.attachments} />
            <dl className="mt-4 grid gap-2 text-xs">
              {[['Budget', kc(t.budget)], t.startAt ? ['Starts no earlier than', when(t.startAt)] : null, t.recurrence ? ['Repeats', t.recurrence.every + ', occurrence ' + t.recurrence.index + ' of ' + t.recurrence.total] : null, t.orderRef ? ['Linked order', t.orderRef] : null, ['Deadline', `${when(t.deadline)} (${timeLeft(t.deadline)})`], ['Posted by', k.posterLabel(t, me)], t.assigneeId ? ['Assigned to', nameOf(t.assigneeId)] : null, held > 0 ? ['Held in escrow', kc(held)] : null]
                .filter((r): r is string[] => !!r).map(([a, b]) => <div key={a} className="flex justify-between border-b border-xedf1eb pb-2"><dt className="text-muted">{a}</dt><dd className="font-bold">{b}</dd></div>)}
            </dl>
          </Card>

          {locked && <Notice>This is step {t.step} of a linked workflow. It opens for bids when step {(t.step ?? 2) - 1} is completed.</Notice>}
          {flow && (
            <Card>
              <h2 className="mb-2 font-display text-base font-bold">Linked workflow · {flow.title}</h2>
              <ol className="grid gap-1.5 text-xs">
                {flow.taskIds.map(id => k.task(id)).filter((x): x is NonNullable<typeof x> => !!x).map(x => (
                  <li key={x.id} className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-surface-2 text-[10px] font-extrabold">{x.step}</span>
                    {x.id === t.id ? <b>{x.title}</b> : <Link className="underline" href={'/tasks/' + x.id}>{x.title}</Link>}<span className="ml-auto"><Badge tone={STATUS_TONE[x.status]}>{statusLabel(x.status)}</Badge></span></li>
                ))}
              </ol>
            </Card>
          )}
          {t.status === 'disputed' && <Notice tone="red"><b>Dispute open.</b> {t.disputeReason} A platform administrator will review and decide; escrow stays frozen until then.</Notice>}

          <Card>
            <h2 className="mb-3 font-display text-base font-bold">Milestones</h2>
            <Stepper steps={steps} />
            {t.milestones.filter(m => m.note || m.deliverables?.length).map(m => (
              <div key={m.id} className="mt-3 rounded-xl bg-xf6f9f4 p-3 text-xs"><b>Delivery for &ldquo;{m.title}&rdquo;</b>{m.note && <p className="mt-1">{m.note}</p>}<AttachmentList files={m.deliverables} /></div>
            ))}
            {scheduled && isAssignee && t.status === 'assigned' && <p className="mt-3 text-[11px] font-bold text-xa66f1e">Scheduled: you can start from {when(t.startAt!)}.</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {isAssignee && t.status === 'assigned' && <Button size="sm" disabled={scheduled} onClick={() => act(kart => kart.startWork(me, t.id), 'Work started')}>Start work</Button>}
              {isAssignee && t.status === 'in_progress' && <Button size="sm" onClick={() => setDialog('submit')}>Submit next milestone</Button>}
              {isPoster && t.status === 'review' && <>
                <Button size="sm" onClick={() => act(kart => kart.approveMilestone(me, t.id), 'Approved and payment released')}>Approve & release payment</Button>
                <Button size="sm" variant="secondary" onClick={() => setDialog('changes')}>Request changes</Button>
              </>}
              {isPoster && (open || ['assigned', 'in_progress'].includes(t.status)) && (
                <Button size="sm" variant="secondary" onClick={() => { if (confirm(held > 0 ? `Cancel this task? ${kc(held)} in escrow returns to your wallet.` : 'Cancel this task?')) act(kart => kart.cancelTask(me, t.id), 'Task cancelled'); }}>Cancel task</Button>
              )}
              {canDispute && <Button size="sm" variant="danger" onClick={() => setDialog('dispute')}>Open dispute</Button>}
              {adminView && t.status === 'disputed' && <>
                <Button size="sm" variant="secondary" onClick={() => act(kart => kart.resolveDispute(me, t.id, 'refund_poster'), 'Refunded the poster')}>Refund poster</Button>
                <Button size="sm" onClick={() => act(kart => kart.resolveDispute(me, t.id, 'release_provider'), 'Released to the provider')}>Release to provider</Button>
              </>}
            </div>
          </Card>

          {t.status === 'completed' && (isPoster || isAssignee) && (
            <Card>
              <h2 className="mb-3 font-display text-base font-bold">Reviews</h2>
              {theirReview && <div className="mb-3 rounded-xl bg-xf6f9f4 p-3 text-xs"><b>{reviewTarget} rated you</b> <StarRating value={theirReview.rating} />{theirReview.comment && <p className="mt-1">{theirReview.comment}</p>}</div>}
              {myReview && <div className="rounded-xl bg-brand-50 p-3 text-xs"><b>Your review of {reviewTarget}</b> <StarRating value={myReview.rating} />{myReview.comment && <p className="mt-1">{myReview.comment}</p>}</div>}
              {mayReview && (
                <form className="grid gap-3" onSubmit={async e => { e.preventDefault(); const r = await act(kart => kart.reviewTask(me, t.id, stars, review), 'Thanks for your review'); if (r.ok) setReview(''); }}>
                  <div><div className="mb-1 text-[11px] font-extrabold text-x55715b">How was {reviewTarget}?</div><StarRating value={stars} onChange={setStars} /></div>
                  <Field label="Comment (optional)"><textarea maxLength={300} className={inputCls + ' min-h-16'} value={review} onChange={e => setReview(e.target.value)} /></Field>
                  <div><Button type="submit" size="sm">Submit review</Button></div>
                </form>
              )}
            </Card>
          )}

          <Card>
            <h2 className="mb-3 font-display text-base font-bold">Bids ({t.bids.length}) <span className="text-[11px] font-medium text-muted">{isPoster ? 'ranked by match score' : ''}</span></h2>
            {t.bids.length === 0 && <Empty title="No bids yet">Providers&apos; proposals will appear here.</Empty>}
            <div className="grid gap-3">
              {ranked.filter(({ b }) => isPoster || b.providerId === me.id || t.assigneeId === b.providerId).map(({ b, m }) => {
                const profile = k.profile(b.providerId);
                const { net } = netPayout(b.amount, k.db.fees.taskFeeRate);
                return (
                  <div key={b.id} className={`rounded-xl border p-4 ${t.assigneeId === b.providerId ? 'border-brand-900 bg-brand-50' : 'border-line'}`}>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <b>{nameOf(b.providerId)}{b.providerId === me.id ? ' (you)' : ''}</b>
                      <span className="text-muted">{profile ? `★ ${profile.rating.toFixed(1)} (${profile.ratingCount})` : 'New provider'}</span>
                      <span className="ml-auto"><ScoreChip score={m.score} label="Match" parts={m.parts} /></span>
                    </div>
                    <p className="my-2 text-xs text-x4c6354">{b.note}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span><b>{kc(b.amount)}</b> · ETA {b.etaHours} h{b.providerId === me.id ? ` · you'd receive ${kc(net)}` : ''}</span>
                      {isPoster && open && <Button size="sm" disabled={!canAfford(b.amount) || locked} title={canAfford(b.amount) ? undefined : 'Top up your wallet to cover this bid'} onClick={() => { if (confirm(`Accept ${nameOf(b.providerId)}'s bid? ${kc(b.amount)} will be held in escrow.`)) act(kart => kart.acceptBid(me, t.id, b.id), 'Bid accepted. Payment is held in escrow'); }}>Accept & hold {kc(b.amount)}</Button>}
                    </div>
                  </div>
                );
              })}
            </div>
            {!isPoster && open && !locked && can(me, 'task:bid') && (
              <form className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2" onSubmit={async e => { e.preventDefault(); await act(kart => kart.placeBid(me, t.id, bid), myBid ? 'Bid updated' : 'Bid submitted'); }}>
                <h3 className="font-display text-sm font-bold sm:col-span-2">{myBid ? 'Update your bid' : 'Place a bid'}</h3>
                <Field label="Your price (KC)"><input type="number" min={1} max={100000} required className={inputCls} value={bid.amount} onChange={e => setBid({ ...bid, amount: Number(e.target.value) })} /></Field>
                <Field label="Hours to finish"><input type="number" min={0.5} step={0.5} required className={inputCls} value={bid.etaHours} onChange={e => setBid({ ...bid, etaHours: Number(e.target.value) })} /></Field>
                <Field label="Proposal" wide><textarea required maxLength={250} className={`${inputCls} min-h-20`} value={bid.note} onChange={e => setBid({ ...bid, note: e.target.value })} placeholder="How will you do it?" /></Field>
                <div className="sm:col-span-2"><Button type="submit">{myBid ? 'Update bid' : 'Submit bid'}</Button> <span className="ml-2 text-[11px] text-muted">You receive {kc(netPayout(bid.amount || 0, k.db.fees.taskFeeRate).net)} after the {Math.round(k.db.fees.taskFeeRate * 100)}% fee.</span></div>
              </form>
            )}
          </Card>
        </div>

        <Card className="content-start self-start lg:sticky lg:top-24">
          <h2 className="mb-1 font-display text-base font-bold">Private conversation</h2>
          {threads.length === 0 ? (
            <p className="text-xs text-muted">{isPoster ? 'Conversations open when someone bids.' : 'Place a bid to start a private conversation with the poster.'}</p>
          ) : (
            <>
              {threads.length > 1 && (
                <div role="tablist" aria-label="Bidders" className="mb-3 flex flex-wrap gap-1">
                  {threads.map(uid => (
                    <button key={uid} role="tab" aria-selected={currentBidder === uid} onClick={() => setActiveKey(`${t.id}:${uid}`)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${currentBidder === uid ? 'bg-brand-900 text-white' : 'bg-surface-2'}`}>{nameOf(uid)}</button>
                  ))}
                </div>
              )}
              <p className="mb-3 text-[11px] text-muted">{isPoster ? 'Only you and this bidder can see this thread.' : 'Only you and the poster can see this thread.'}</p>
              {current && <ChatThread key={current} threadKey={current} otherName={isPoster || adminView ? nameOf(currentBidder) : (t.anonymous ? 'Anonymous student' : nameOf(t.posterId))} canNegotiate={open && !locked && !closedThread} readOnly={closedThread || ['completed', 'cancelled', 'resolved'].includes(t.status) || (adminView && !isPoster && !isAssignee)} />}
            </>
          )}
        </Card>
      </div>

      {dialog && (
        <Modal title={dialog === 'dispute' ? 'Open a dispute' : dialog === 'submit' ? 'Submit milestone' : 'Request changes'} onClose={() => { setDialog(null); setReason(''); setFiles([]); }}>
          <form className="grid gap-3" onSubmit={async e => {
            e.preventDefault();
            const r = await act(kart => dialog === 'dispute' ? kart.openDispute(me, t.id, reason) : dialog === 'submit' ? kart.submitWork(me, t.id, { note: reason, files }) : kart.requestChanges(me, t.id, reason), dialog === 'dispute' ? 'Dispute opened' : dialog === 'submit' ? 'Submitted for review' : 'Changes requested');
            if (r.ok) { setDialog(null); setReason(''); setFiles([]); }
          }}>
            <Field label={dialog === 'dispute' ? 'What went wrong?' : dialog === 'submit' ? 'Delivery note (optional)' : 'What should change?'}><textarea required={dialog === 'dispute'} maxLength={400} className={`${inputCls} min-h-24`} value={reason} onChange={e => setReason(e.target.value)} /></Field>
            {dialog === 'submit' && <FilePicker files={files} onChange={setFiles} label="Attach your deliverables" />}
            {dialog === 'dispute' && <p className="text-[11px] text-muted">Escrow stays frozen and a platform administrator can read this task&apos;s conversation until the dispute is resolved.</p>}
            <Button type="submit" variant={dialog === 'dispute' ? 'danger' : 'primary'}>{dialog === 'dispute' ? 'Open dispute' : dialog === 'submit' ? 'Submit for review' : 'Send request'}</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
