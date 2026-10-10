'use client';
import { useEffect, useRef, useState } from 'react';
import { Kart, type Message } from '@/mock/db';
import type { FileLike } from '@/lib/attachments';
import { useKart } from '@/mock/StoreProvider';
import { AttachmentList, FilePicker } from '@/components/FilePicker';
import { Button, Field, inputCls, cx, kc, when } from '@/components/ui';

const QUOTE_TONE = { pending: 'border-amber-kart bg-surface-2', accepted: 'border-brand-200 bg-brand-50', declined: 'border-xe5c0c0 bg-danger-50', superseded: 'border-line bg-xf6f6f4 opacity-70', expired: 'border-line bg-xf6f6f4 opacity-70' } as const;

/** One private conversation: the poster and a single bidder. Messages render as plain text (escaped by React). */
export function ChatThread({ threadKey, readOnly, otherName, canNegotiate }: { threadKey: string; readOnly?: boolean; otherName: string; canNegotiate?: boolean }) {
  const { k, me, act, version } = useKart();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<FileLike[]>([]);
  const [offer, setOffer] = useState(false);
  const [terms, setTerms] = useState({ amount: 0, etaHours: 4 });
  const end = useRef<HTMLDivElement>(null);
  const messages = me ? k.readThread(me, threadKey) : [];
  const warn = Kart.looksLikeContactInfo(text);
  const bid = k.task(threadKey.split(':')[0])?.bids.find(b => b.providerId === threadKey.split(':')[1]);

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length, version]);

  const renderQuote = (m: Message) => {
    const q = m.quote!;
    const mine = q.by === me?.id;
    return (
      <div key={m.id} className={cx('my-2 max-w-[90%] rounded-xl border p-3 text-xs', QUOTE_TONE[q.status], mine ? 'ml-auto' : '')}>
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-x8a6a25">{mine ? 'Your offer' : `${otherName}'s offer`} · {q.status}</div>
        <div className="mt-1 text-sm font-extrabold">{kc(q.amount)} <span className="font-medium text-muted">in {q.etaHours} h</span></div>
        {q.status === 'pending' && !mine && !readOnly && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => act(kart => kart.respondQuote(me!, m.id, true), 'Terms agreed')}>Accept terms</Button>
            <Button size="sm" variant="secondary" onClick={() => act(kart => kart.respondQuote(me!, m.id, false), 'Offer declined')}>Decline</Button>
          </div>
        )}
        {q.status === 'pending' && mine && <div className="mt-1 text-[10px] text-muted">Waiting for {otherName}</div>}
        <small className="mt-1 block text-[9px] text-x7b907e">{when(m.ts)}</small>
      </div>
    );
  };

  return (
    <div className="grid gap-3">
      <div role="log" aria-label={`Conversation with ${otherName}`} className="max-h-80 min-h-24 overflow-y-auto rounded-xl bg-xf6f9f4 p-3">
        {messages.length === 0 && <p className="py-6 text-center text-xs text-muted">No messages yet. Say hello or ask a question.</p>}
        {messages.map(m => {
          if (m.kind === 'system') return <p key={m.id} className="my-2 text-center text-[10px] font-bold text-x8b9b8e">{m.body}</p>;
          if (m.kind === 'quote' && m.quote) return renderQuote(m);
          const mine = m.senderId === me?.id;
          return (
            <div key={m.id} className={cx('my-1.5 max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-xs', mine ? 'ml-auto bg-xd7ead8' : 'bg-surface')}>
              {m.body}
              <AttachmentList files={m.attachments} />
              <small className="mt-1 block text-[9px] text-x7b907e">{mine ? 'You' : otherName} · {when(m.ts)}</small>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {!readOnly && (
        <>
          <form className="grid gap-2" onSubmit={async e => {
            e.preventDefault();
            const r = await act((kart, user) => kart.sendMessage(user, threadKey, text, files));
            if (r.ok) { setText(''); setFiles([]); }
          }}>
            <div className="flex gap-2">
              <input aria-label="Message" maxLength={2000} className={inputCls} value={text} onChange={e => setText(e.target.value)} placeholder="Write a message…" />
              <Button type="submit" size="sm" disabled={!text.trim() && files.length === 0}>Send</Button>
            </div>
            <FilePicker files={files} onChange={setFiles} max={3} label="Attach" />
            {warn && <p className="text-[10px] font-bold text-xa66f1e">Heads up: keep contact details and payments on KART so escrow and dispute protection still apply.</p>}
          </form>
          {canNegotiate && bid && (
            offer ? (
              <form className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2" onSubmit={async e => {
                e.preventDefault();
                const r = await act((kart, user) => kart.sendQuote(user, threadKey, terms), 'Offer sent');
                if (r.ok) setOffer(false);
              }}>
                <Field label="Price (KC)"><input type="number" min={1} max={100000} required className={inputCls} value={terms.amount} onChange={e => setTerms({ ...terms, amount: Number(e.target.value) })} /></Field>
                <Field label="Hours to finish"><input type="number" min={0.5} step={0.5} required className={inputCls} value={terms.etaHours} onChange={e => setTerms({ ...terms, etaHours: Number(e.target.value) })} /></Field>
                <div className="flex gap-2 sm:col-span-2"><Button type="submit" size="sm">Send offer</Button><Button type="button" size="sm" variant="secondary" onClick={() => setOffer(false)}>Cancel</Button></div>
              </form>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => { setTerms({ amount: bid.amount, etaHours: bid.etaHours }); setOffer(true); }}>⇄ Propose new terms (now {kc(bid.amount)} · {bid.etaHours} h)</Button>
            )
          )}
        </>
      )}
      {readOnly && <p className="text-[10px] text-muted">Read-only. Platform access to this thread is logged.</p>}
    </div>
  );
}
