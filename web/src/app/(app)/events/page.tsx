'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { Badge, Button, Card, CardGrid, Empty, Field, inputCls, kc, Modal, PageHead, Tabs, when } from '@/components/ui';
import { ItemImage } from '@/components/ItemImage';

type Tab = 'discover' | 'tickets' | 'hosting';
const toLocal = (ms: number) => new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function Events() {
  const { k, me, act } = useKart();
  const [tab, setTab] = useState<Tab>('discover');
  const [host, setHost] = useState(false);
  const [f, setF] = useState({ name: '', desc: '', place: '', date: toLocal(Date.now() + 7 * 86_400_000), price: 0, seats: 50 });
  if (!me) return null;

  const approved = k.db.events.filter(e => e.status === 'approved' && e.date > Date.now());
  const tickets = k.db.tickets.filter(t => t.userId === me.id);
  const hosting = k.db.events.filter(e => e.hostId === me.id);

  return (
    <>
      <PageHead kicker="WHAT'S HAPPENING" title="Campus events" sub="Discover clubs, workshops and memorable nights." action={<Button onClick={() => setHost(true)}>+ Host an event</Button>} />
      
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'discover', label: 'Discover' }, { id: 'tickets', label: `My tickets (${tickets.length})` }, { id: 'hosting', label: `Hosting (${hosting.length})` }]} />
      
      {tab === 'discover' && (approved.length === 0 ? <Empty icon="🎉" title="No upcoming events" /> : (
        <CardGrid>
          {approved.map(e => {
            const left = k.seatsLeft(e), has = tickets.some(t => t.eventId === e.id), mine = e.hostId === me.id;
            return (
              <article key={e.id} className="group overflow-hidden rounded-2xl border border-line bg-surface hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <ItemImage name={e.name} type="event" className="h-32 w-full transition-transform duration-500 group-hover:scale-105" icon={e.icon} />
                <div className="p-4">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-brand-700">{k.user(e.hostId)?.name} · {when(e.date)}</div>
                  <h3 className="mt-1.5 font-display text-base font-bold">{e.name}</h3>
                  <p className="min-h-8 text-[11px] text-muted line-clamp-2 mt-0.5">{e.desc}</p>
                  <div className="mt-2 text-[11px] font-medium text-muted flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                    {e.place} · {left > 0 ? <span className="text-brand-900">{left} seats left</span> : <span className="text-danger-700 font-bold">Full</span>}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-display text-lg font-bold">{e.price ? kc(e.price) : 'Free'}</span>
                    <Button size="sm" disabled={has || mine || left <= 0} onClick={() => act(kart => kart.registerEvent(me, e.id), 'You’re in! Ticket added')}>
                      {mine ? 'Your event' : has ? 'Registered' : left <= 0 ? 'Sold out' : 'Register'}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </CardGrid>
      ))}

      {tab === 'tickets' && (tickets.length === 0 ? <Empty icon="🎟️" title="No tickets yet">Register for an event to see it here.</Empty> : (
        <CardGrid>{tickets.map(t => {
          const e = k.db.events.find(x => x.id === t.eventId);
          if (!e) return null;
          return (
            <Card key={t.id} className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full overflow-hidden mb-3 border-2 border-brand-100">
                <ItemImage name={e.name} type="event" className="w-full h-full" icon={e.icon} />
              </div>
              <h3 className="font-display text-base font-bold">{e.name}</h3>
              <p className="text-[11px] text-muted mt-1">{when(e.date)} · {e.place}</p>
              <code className="mt-4 block rounded-lg bg-surface-2 px-3 py-2 text-center text-sm font-bold tracking-widest text-brand-900 border border-line">{t.code}</code>
              <p className="mt-1.5 text-[10px] text-muted">Show this code at the door</p>
            </Card>
          );
        })}</CardGrid>
      ))}

      {tab === 'hosting' && (hosting.length === 0 ? <Empty icon="🎤" title="You aren't hosting anything">Submit an event for the campus admin to approve.</Empty> : (
        <div className="grid gap-3">{hosting.map(e => (
          <Card key={e.id} hover className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl overflow-hidden flex-none">
                <ItemImage name={e.name} type="event" className="w-full h-full" />
              </div>
              <div>
                <b className="text-sm font-display">{e.name}</b>
                <div className="text-[11px] text-muted mt-0.5">{when(e.date)} · {e.place} · <strong className="text-brand-900">{e.seats - k.seatsLeft(e)}/{e.seats}</strong> registered</div>
              </div>
            </div>
            <Badge tone={e.status === 'approved' ? 'green' : e.status === 'pending' ? 'amber' : 'gray'}>
              {e.status === 'pending' ? 'Awaiting approval' : e.status}
            </Badge>
          </Card>
        ))}</div>
      ))}

      {host && (
        <Modal title="Host an event" onClose={() => setHost(false)}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={async e => { e.preventDefault(); const r = await act(kart => kart.submitEvent(me, { ...f, date: new Date(f.date).getTime() }), 'Submitted for campus approval'); if (r.ok) { setHost(false); setTab('hosting'); } }}>
            <Field label="Event name" wide><input required maxLength={70} className={inputCls} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Description" wide><textarea required maxLength={300} className={`${inputCls} min-h-20 resize-none`} value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} /></Field>
            <Field label="Venue"><input required maxLength={60} className={inputCls} value={f.place} onChange={e => setF({ ...f, place: e.target.value })} /></Field>
            <Field label="Date & time"><input type="datetime-local" required className={inputCls} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Ticket price (KC, 0 = free)"><input type="number" min={0} max={5000} className={inputCls} value={f.price} onChange={e => setF({ ...f, price: Number(e.target.value) })} /></Field>
            <Field label="Seats"><input type="number" min={1} max={2000} required className={inputCls} value={f.seats} onChange={e => setF({ ...f, seats: Number(e.target.value) })} /></Field>
            <p className="text-[11px] text-muted sm:col-span-2">A campus administrator reviews every event before it is listed.</p>
            <Button type="submit" className="sm:col-span-2">Submit for approval</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
