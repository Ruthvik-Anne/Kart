// Simulated permissioned audit chain. The ledger stays the system of record; the chain anchors
// hashes of journal entries so any later edit is detectable. No PII is ever written here.
import type { JournalEntry } from '@/ledger/ledger';

export interface Block {
  index: number;
  prevHash: string;
  merkleRoot: string;
  entryIds: string[];
  entryHashes: string[];
  ts: number;
  hash: string;
}

export const GENESIS_HASH = '0'.repeat(64);

export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Canonical JSON: fixed key order so the same entry always hashes identically. */
export function canonical(e: JournalEntry): string {
  return JSON.stringify({
    id: e.id, key: e.key, type: e.type, ts: e.ts,
    postings: e.postings.map(p => [p.account, p.side, p.amount]),
  });
}

export const hashEntry = (e: JournalEntry) => sha256(canonical(e));

export async function merkleRoot(hashes: string[]): Promise<string> {
  if (hashes.length === 0) return GENESIS_HASH;
  let level = hashes;
  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) nextLevel.push(await sha256(level[i] + (level[i + 1] ?? level[i])));
    level = nextLevel;
  }
  return level[0];
}

const headerOf = (b: Pick<Block, 'index' | 'prevHash' | 'merkleRoot' | 'ts'>) =>
  `${b.index}|${b.prevHash}|${b.merkleRoot}|${b.ts}`;

export async function appendBlock(chain: Block[], entries: JournalEntry[], ts = Date.now()): Promise<Block> {
  const entryHashes = await Promise.all(entries.map(hashEntry));
  const root = await merkleRoot(entryHashes);
  const index = chain.length;
  const prevHash = index === 0 ? GENESIS_HASH : chain[index - 1].hash;
  const hash = await sha256(headerOf({ index, prevHash, merkleRoot: root, ts }));
  const block: Block = { index, prevHash, merkleRoot: root, entryIds: entries.map(e => e.id), entryHashes, ts, hash };
  chain.push(block);
  return block;
}

export interface VerifyResult { ok: boolean; problems: string[] }

/** Recompute every block link and every anchored entry hash against the live ledger. */
export async function verifyChain(chain: Block[], ledgerEntries: JournalEntry[]): Promise<VerifyResult> {
  const problems: string[] = [];
  const byId = new Map(ledgerEntries.map(e => [e.id, e]));
  for (const [i, b] of chain.entries()) {
    const expectedPrev = i === 0 ? GENESIS_HASH : chain[i - 1].hash;
    if (b.prevHash !== expectedPrev) problems.push(`Block ${i}: broken link to previous block.`);
    if (await merkleRoot(b.entryHashes) !== b.merkleRoot) problems.push(`Block ${i}: Merkle root does not match its entry hashes.`);
    if (await sha256(headerOf(b)) !== b.hash) problems.push(`Block ${i}: block hash does not match its header.`);
    for (const [j, id] of b.entryIds.entries()) {
      const entry = byId.get(id);
      if (!entry) problems.push(`Block ${i}: entry ${id} is missing from the ledger.`);
      else if (await hashEntry(entry) !== b.entryHashes[j]) problems.push(`Block ${i}: entry ${id} was modified after anchoring.`);
    }
  }
  const anchored = new Set(chain.flatMap(b => b.entryIds));
  const pending = ledgerEntries.filter(e => !anchored.has(e.id)).length;
  if (pending) problems.push(`${pending} ledger entr${pending === 1 ? 'y is' : 'ies are'} not yet anchored.`);
  return { ok: problems.length === 0, problems };
}
