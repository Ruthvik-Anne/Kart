import { describe, expect, it } from 'vitest';
import { appendBlock, GENESIS_HASH, verifyChain, type Block } from './chain';
import { Ledger } from '@/ledger/ledger';
import * as rules from '@/ledger/rules';

async function build() {
  const ledger = new Ledger();
  ledger.post(rules.topUp('u1', 1000, 'a'));
  ledger.post(rules.checkout('O1', 'u1', 'v1', 200, rules.DEFAULT_FEES));
  const chain: Block[] = [];
  await appendBlock(chain, ledger.entries.slice(0, 1));
  await appendBlock(chain, ledger.entries.slice(1));
  return { ledger, chain };
}

describe('audit chain', () => {
  it('links blocks from a genesis hash', async () => {
    const { chain } = await build();
    expect(chain[0].prevHash).toBe(GENESIS_HASH);
    expect(chain[1].prevHash).toBe(chain[0].hash);
  });
  it('verifies a clean chain', async () => {
    const { ledger, chain } = await build();
    expect(await verifyChain(chain, ledger.entries)).toEqual({ ok: true, problems: [] });
  });
  it('detects a ledger entry edited after anchoring', async () => {
    const { ledger, chain } = await build();
    ledger.entries[1].postings[0].amount += 1;
    const r = await verifyChain(chain, ledger.entries);
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/JE-00002 was modified/);
  });
  it('detects a rewritten block and a broken link', async () => {
    const { ledger, chain } = await build();
    chain[0].merkleRoot = 'f'.repeat(64);
    const r = await verifyChain(chain, ledger.entries);
    expect(r.ok).toBe(false);
    expect(r.problems.length).toBeGreaterThan(0);
  });
  it('flags entries that are not anchored yet', async () => {
    const { ledger, chain } = await build();
    ledger.post(rules.topUp('u2', 50, 'late'));
    const r = await verifyChain(chain, ledger.entries);
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/not yet anchored/);
  });
});
