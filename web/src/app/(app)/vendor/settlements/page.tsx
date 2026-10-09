'use client';
import { useKart } from '@/mock/StoreProvider';
import { Button, Card, DataTable, Empty, kc, Notice, PageHead, Stat, StatGrid, when } from '@/components/ui';

export default function Settlements() {
  const { k, me, act } = useKart();
  if (!me?.storeId) return null;
  const payable = `VENDOR_PAYABLE:${me.id}`;
  const rows = k.ledger.entries.filter(e => e.postings.some(p => p.account === payable)).reverse().map(e => {
    const p = e.postings.find(x => x.account === payable)!;
    return { e, signed: p.side === 'credit' ? p.amount : -p.amount };
  });
  const owed = k.ledger.balance(payable);
  const gross = k.db.orders.filter(o => o.storeId === me.storeId && o.status !== 'Cancelled').reduce((a, o) => a + o.amount, 0);
  const settled = rows.filter(r => r.e.type === 'settlement').reduce((a, r) => a - r.signed, 0);
  return (
    <>
      <PageHead kicker="FINANCE" title="Settlements" sub="What KART owes you, and what has been paid out."
        action={<Button disabled={owed <= 0} onClick={() => act(kart => kart.settle(me, me.storeId!), 'Settlement batch sent to the payment partner (simulated)')}>Settle {kc(owed)} now</Button>} />
      <Notice>Settlement is simulated. In production, payouts go to your verified bank account through the payment partner on an end-of-day, weekly or monthly schedule.</Notice>
      <StatGrid>
        <Stat label="Awaiting settlement" value={kc(owed)} /><Stat label="Gross sales" value={kc(gross)} />
        <Stat label="Commission rate" value={`${(k.db.fees.vendorCommissionRate * 100).toFixed(0)}%`} /><Stat label="Already settled" value={kc(settled)} />
      </StatGrid>
      {rows.length === 0 ? <Empty title="No settlement activity yet" /> : (
        <DataTable head={['Entry', 'Description', 'Date', 'Effect']} rows={rows.map(({ e, signed }) => [
          <code key="i" className="text-[11px]">{e.id}</code>, e.memo, when(e.ts),
          <b key="a" className={signed >= 0 ? 'text-[#338454]' : 'text-[#c46b48]'}>{signed >= 0 ? '+' : '−'}{kc(Math.abs(signed))}</b>])} />
      )}
      <Card className="mt-4 text-[11px] text-muted">Each row is a balanced double-entry journal entry. Commission is booked to KART revenue at checkout.</Card>
    </>
  );
}
