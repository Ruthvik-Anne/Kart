'use client';
import { useState } from 'react';
import { useKart } from '@/mock/StoreProvider';
import { verifyChain, type VerifyResult } from '@/chain/chain';
import { Button, Card, DataTable, Notice, PageHead, Stat, StatGrid, when } from '@/components/ui';

export default function AuditChain() {
  const { k, me, act, version } = useKart();
  const [result, setResult] = useState<(VerifyResult & { at: number; v: number }) | null>(null);
  if (!me) return null;
  const chain = k.db.chain;
  const anchored = new Set(chain.flatMap(b => b.entryIds)).size;
  // A previous result is stale once the ledger or chain changes.
  const shown = result && result.v === version ? result : null;

  return (
    <>
      <PageHead kicker="PLATFORM ADMIN" title="Audit chain" sub="A tamper-evident record of ledger entries. The ledger remains the source of truth." />
      <Notice tone="green">Simulated permissioned chain: each block holds SHA-256 hashes of journal entries and links to the previous block. Production design: Hyperledger Fabric with Kart, campus and payment-partner peers. No personal data goes on-chain.</Notice>
      <StatGrid>
        <Stat label="Blocks" value={chain.length} /><Stat label="Entries anchored" value={`${anchored} / ${k.ledger.entries.length}`} />
        <Stat label="Last block" value={chain.length ? `#${chain[chain.length - 1].index}` : '—'} />
        <Stat label="Last check" value={shown ? (shown.ok ? 'Passed' : 'FAILED') : 'Not run'} />
      </StatGrid>
      <div className="mb-5 flex flex-wrap gap-2">
        <Button onClick={() => act(kart => kart.anchor(me), 'Block added to the chain')}>Anchor new entries</Button>
        <Button variant="secondary" onClick={async () => { const r = await verifyChain(k.db.chain, k.ledger.entries); setResult({ ...r, at: Date.now(), v: version }); }}>Verify chain against ledger</Button>
        <Button variant="danger" onClick={() => { if (confirm('Demo only: this alters one anchored ledger entry so you can see verification fail. Continue?')) act(kart => kart.tamperDemo(me), 'Entry altered (demo). Run verification'); }}>Tamper with an entry (demo)</Button>
      </div>
      {shown && (
        <Card className={`mb-5 ${shown.ok ? '!border-[#cfe6d2]' : '!border-red-300 !bg-red-50'}`}>
          <b className={shown.ok ? 'text-[#2f7a45]' : 'text-red-700'}>{shown.ok ? '✓ Chain verified: every anchored entry matches the ledger.' : '✗ Verification failed'}</b>
          {!shown.ok && <ul className="mt-2 list-disc pl-5 text-xs text-red-800">{shown.problems.map(p => <li key={p}>{p}</li>)}</ul>}
          <div className="mt-1 text-[10px] text-muted">Checked {when(shown.at)}</div>
        </Card>
      )}
      <DataTable head={['Block', 'Entries', 'Merkle root', 'Hash', 'Previous']} rows={[...chain].reverse().map(b => [
        `#${b.index}`, b.entryIds.join(', '), <code key="m" className="text-[10px]">{b.merkleRoot.slice(0, 16)}…</code>, <code key="h" className="text-[10px]">{b.hash.slice(0, 16)}…</code>, <code key="p" className="text-[10px]">{b.prevHash.slice(0, 8)}…</code>])} />
    </>
  );
}
