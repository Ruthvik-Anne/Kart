'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { Badge, Button, DataTable, Empty, Field, inputCls, kc, Modal, PageHead } from '@/components/ui';

/** Stock editor, shared by the canteen menu and stationery inventory routes. */
export function StockTable({ title, kicker }: { title: string; kicker: string }) {
  const { k, me, act } = useKart();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ name: '', price: 50, stock: 20, desc: '' });
  if (!me?.storeId) return null;
  const items = k.db.products.filter(p => p.storeId === me.storeId);
  return (
    <>
      <PageHead kicker={kicker} title={title} sub="Stock changes show to students immediately. Items at zero are marked unavailable."
        action={<Button onClick={() => setAdding(true)}>+ Add item</Button>} />
      {adding && (
        <Modal title="Add an item" onClose={() => setAdding(false)}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={async e => { e.preventDefault(); const r = await act(kart => kart.addProduct(me, nf), 'Item added'); if (r.ok) { setAdding(false); setNf({ name: '', price: 50, stock: 20, desc: '' }); } }}>
            <Field label="Name" wide><input required maxLength={60} className={inputCls} value={nf.name} onChange={e => setNf({ ...nf, name: e.target.value })} /></Field>
            <Field label="Price (KC)"><input type="number" min={1} max={100000} required className={inputCls} value={nf.price} onChange={e => setNf({ ...nf, price: Number(e.target.value) })} /></Field>
            <Field label="Stock"><input type="number" min={0} max={10000} required className={inputCls} value={nf.stock} onChange={e => setNf({ ...nf, stock: Number(e.target.value) })} /></Field>
            <Field label="Short description" wide><input required maxLength={120} className={inputCls} value={nf.desc} onChange={e => setNf({ ...nf, desc: e.target.value })} /></Field>
            <Button type="submit" className="sm:col-span-2">Add item</Button>
          </form>
        </Modal>
      )}
      {items.length === 0 ? <Empty title="No items yet" /> : (
        <DataTable head={['Item', 'Price', 'Stock', '']} rows={items.map(p => [
          <span key="n"><span aria-hidden>{p.icon} </span><b>{p.name}</b><br /><span className="text-muted">{p.desc}</span></span>,
          kc(p.price),
          <span key="s" className="flex items-center gap-2"><input aria-label={`Stock for ${p.name}`} type="number" min={0} max={10000} className={`${inputCls} !w-24`} value={draft[p.id] ?? String(p.stock)} onChange={e => setDraft({ ...draft, [p.id]: e.target.value })} />{p.stock <= 5 && <Badge tone={p.stock === 0 ? 'red' : 'amber'}>{p.stock === 0 ? 'Out' : 'Low'}</Badge>}</span>,
          <Button key="b" size="sm" variant="secondary" disabled={draft[p.id] === undefined || draft[p.id] === String(p.stock)} onClick={async () => { const r = await act(kart => kart.setStock(me, p.id, Number(draft[p.id])), 'Stock updated'); if (r.ok) setDraft(({ [p.id]: _drop, ...rest }) => rest); }}>Save</Button>,
        ])} />
      )}
    </>
  );
}

export default function Menu() {
  return <StockTable title="Menu & stock" kicker="CANTEEN" />;
}
