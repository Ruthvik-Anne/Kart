# Private blockchain audit layer

## Role
Tamper evidence and reconciliation, **not** the system of record. PostgreSQL stays authoritative. No personal data goes on-chain: only entry ids, SHA-256 hashes, timestamps and entry types.

## What is simulated in this repo
`src/chain/chain.ts`:
- `hashEntry`: SHA-256 of a canonical JSON form of a journal entry (fixed key order).
- `appendBlock`: batches un-anchored entries into a block with a Merkle root, linked to the previous block hash (genesis = 64 zeros).
- `verifyChain`: recomputes every link, Merkle root, block hash and every anchored entry hash against the live ledger, and reports entries not yet anchored.

The admin **Audit chain** page can anchor, verify, and run a tamper demo that edits one anchored entry so verification visibly fails. Covered by `src/chain/chain.test.ts` and the browser E2E.

## Hyperledger Fabric target
- One channel `kart-audit`.
- Organisations: Kart Platform (also runs the Raft orderer), Campus/Institution, PPI/bank partner. Each runs at least one peer.
- Endorsement policy: settlement anchors need Kart **and** the partner; ordinary ledger anchors need Kart plus any one other org.
- Chaincode: `AnchorEntry(entryId, hash, ts, type)`, `AnchorBatch(root, entryIds[])`, `AnchorSettlement(batchId, vendorId, amountHash)`, `VerifyEntry(entryId, hash)`.
- Private data collections hold settlement amounts per vendor; only a hash goes to the shared ledger.
- An anchoring worker (Celery) reads committed ledger entries, submits batches, retries with backoff and records the Fabric transaction id back on the batch.
- A daily reconciliation job recomputes hashes from PostgreSQL and compares them with the chain, then alerts on mismatches, gaps and unanchored entries older than a threshold.

## Operational notes
Key management and identity (Fabric CA / MSP), backups of orderer and peers, and an explicit decision on who may read the channel need sign-off before launch. The chain is optional (Phase 3): the product works without it.
