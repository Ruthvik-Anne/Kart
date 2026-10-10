'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { Badge, Button, CardGrid, Field, inputCls, kc, Modal, PageHead } from '@/components/ui';
import { ItemImage } from '@/components/ItemImage';

export default function Services() {
  const { k, me, act } = useKart();
  const [offer, setOffer] = useState(false);
  const [f, setF] = useState({ name: '', price: 200, unit: 'hour', desc: '' });
  if (!me) return null;
  const pending = k.db.verifications.some(v => v.userId === me.id && v.kind === 'provider' && v.status === 'pending');

  return (
    <>
      <PageHead kicker="SKILLS ON CAMPUS" title="Student services" sub="Learn, create and collaborate with verified peers."
        action={me.providerEnabled
          ? <Button variant="secondary" onClick={() => setOffer(true)}>+ Offer a service</Button>
          : <Button variant="secondary" disabled={pending} onClick={() => act(kart => kart.requestProviderVerification(me), 'Verification requested')}>{pending ? 'Verification pending' : 'Become a provider'}</Button>} />
      
      <Link href="/xerox" className="mb-5 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-xs transition-colors hover:bg-brand-100">
        <span className="text-2xl" aria-hidden>🖨️</span><span><b className="block text-brand-900">Looking for printing?</b><span className="text-brand-800">Xerox & Print has its own page: set pages, copies and binding →</span></span>
      </Link>
      <CardGrid>
        {k.db.services.map(s => {
          const provider = k.user(s.providerId), profile = k.profile(s.providerId);
          return (
            <article key={s.id} className="group overflow-hidden rounded-2xl border border-line bg-surface hover:-translate-y-0.5 hover:shadow-md hover:border-brand-200 transition-all duration-200">
              <ItemImage name={s.name} type="task" className="h-32 w-full transition-transform duration-500 group-hover:scale-105" icon={s.icon} />
              <div className="p-4">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-brand-700">{profile ? `★ ${profile.rating.toFixed(1)} · ` : ''}{provider?.name}</div>
                <h3 className="mt-1.5 font-display text-base font-bold">{s.name}</h3>
                <p className="min-h-8 text-[11px] text-muted line-clamp-2 mt-0.5">{s.desc}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-display text-lg font-bold">{kc(s.price)}<small className="text-[11px] font-normal text-muted"> / {s.unit}</small></span>
                  {s.providerId === me.id ? <Badge>Your service</Badge> : <Link href={`/tasks/new`} className="rounded-xl border border-line px-3 py-2 text-[11px] font-extrabold text-brand-900 hover:bg-brand-50 transition-colors">Hire via task →</Link>}
                </div>
              </div>
            </article>
          );
        })}
      </CardGrid>
      {offer && (
        <Modal title="Offer a service" onClose={() => setOffer(false)}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={async e => { e.preventDefault(); const r = await act(kart => kart.offerService(me, f), 'Service published'); if (r.ok) { setOffer(false); setF({ name: '', price: 200, unit: 'hour', desc: '' }); } }}>
            <Field label="Service title" wide><input required maxLength={70} className={inputCls} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Price (KC)"><input type="number" min={1} max={100000} required className={inputCls} value={f.price} onChange={e => setF({ ...f, price: Number(e.target.value) })} /></Field>
            <Field label="Per"><select className={inputCls} value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })}><option value="hour">Hour</option><option value="project">Project</option><option value="session">Session</option></select></Field>
            <Field label="What you offer" wide><textarea required maxLength={250} className={`${inputCls} min-h-20`} value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} /></Field>
            <Button type="submit" className="sm:col-span-2">Publish service</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
