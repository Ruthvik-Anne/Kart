'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { accountType } from '@/ledger/ledger';
import { Badge, DataTable, kc, Notice, PageHead, Stat, StatGrid, Tabs, when, inputCls } from '@/components/ui';

export default function LedgerExplorer() {
  const { k } = useKart();
  const [tab, setTab] = useState<'entries' | 'accounts'>('entries');
  const [filter, setFilter] = useState('');
  const tb = k.ledger.trialBalance();
  const entries = [...k.ledger.entries].reverse().filter(e => !filter || `${e.id} ${e.type} ${e.memo} ${e.postings.map(p => p.account).join(' ')}`.toLowerCase().includes(filter.toLowerCase()));
  const label = (a: string) => { const [n, id] = a.split(':'); const u = id && k.user(id); return u ? `${n} · ${u.name}` : a; };

  return (
    <>
      <PageHead kicker="PLATFORM ADMIN" title="Ledger explorer" sub="Append-only double-entry journal. Balances are derived from these postings." />
      <Notice tone={tb.balanced ? 'green' : 'red'}>Trial balance: debits {kc(tb.debits)} {tb.balanced ? '=' : '≠'} credits {kc(tb.credits)}. {tb.balanced ? 'The books balance.' : 'The books do not balance: investigate immediately.'}</Notice>
      <StatGrid>
        <Stat label="Journal entries" value={k.ledger.entries.length} /><Stat label="Accounts" value={k.ledger.accounts().length} />
        <Stat label="User wallets (liability)" value={kc(k.db.users.reduce((a, u) => a + k.balance(u.id), 0))} />
        <Stat label="Platform revenue" value={kc(k.ledger.balance('PLATFORM_FEES') + k.ledger.balance('VENDOR_COMMISSION'))} />
      </StatGrid>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'entries', label: 'Journal' }, { id: 'accounts', label: 'Accounts' }]} />
      {tab === 'entries' ? (
        <>
          <input aria-label="Filter entries" className={`${inputCls} mb-3 max-w-xs`} placeholder="Filter by id, type, account…" value={filter} onChange={e => setFilter(e.target.value)} />
          <DataTable head={['Entry', 'Type', 'Postings', 'Date']} rows={entries.map(e => [
            <code key="i" className="text-[11px]">{e.id}</code>, <span key="t"><Badge tone="gray">{e.type}</Badge><br /><span className="text-muted">{e.memo}</span></span>,
            <div key="p" className="grid gap-0.5">{e.postings.map((p, i) => <div key={i} className="flex justify-between gap-4 text-[11px]"><span>{p.side === 'debit' ? 'Dr' : 'Cr'} {label(p.account)}</span><b>{kc(p.amount)}</b></div>)}</div>, when(e.ts)])} />
        </>
      ) : (
        <DataTable head={['Account', 'Type', 'Balance']} rows={k.ledger.accounts().map(a => [label(a), accountType(a), <b key="b">{kc(k.ledger.balance(a))}</b>])} />
      )}
    </>
  );
}
