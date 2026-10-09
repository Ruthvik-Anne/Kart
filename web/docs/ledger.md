# Double-entry ledger

Code: `src/ledger/ledger.ts` (journal), `src/ledger/rules.ts` (posting rules). Tests: `src/ledger/ledger.test.ts`.

## Principles
- Every money movement is one `JournalEntry` with 2+ postings. Sum of debits equals sum of credits, otherwise `post()` throws.
- Amounts are positive integers in KC.
- Append-only. Corrections are reversing entries (`Ledger.reverse`), never edits.
- Idempotent: re-posting the same `key` returns the original entry.
- Balances are derived from postings, never stored. Wallet, escrow and vendor-payable accounts can never go negative.

## Accounts
| Account | Type | Meaning |
|---|---|---|
| `PPI_PARTNER_FLOAT` | asset | Mirror of funds held at the PPI partner (not Kart's money) |
| `USER_WALLET:{id}` | liability | What Kart owes a user |
| `VENDOR_PAYABLE:{id}` | liability | Owed to a vendor, until settled |
| `TASK_ESCROW:{taskId}` / `{listingId}~{cycle}` | liability | Held until approval or handover |
| `PENDING_SETTLEMENT` | liability | Payouts sent to the partner, not yet confirmed |
| `PLATFORM_FEES`, `VENDOR_COMMISSION` | revenue | Kart's income |

## Posting rules
| Event | Debit | Credit |
|---|---|---|
| Top-up (mock PPI) | PPI float | user wallet |
| Order / print checkout | buyer wallet | vendor payable (net) + commission |
| Order refund | vendor payable + commission | buyer wallet |
| Task bid accepted | poster wallet | task escrow |
| Milestone approved | task escrow | provider wallet (net) + platform fees |
| Task cancelled / dispute refund | task escrow | poster wallet |
| Marketplace reserve / handover / cancel | same as task escrow, keyed per listing cycle | |
| Paid event ticket | buyer wallet | host wallet (net) + commission |
| Vendor settlement | vendor payable | pending settlement, then PPI float on partner confirmation |
| Cash-out (mock) | user wallet | pending settlement |

Fees: `ceil(amount * rate)` goes to the platform, so splits always sum exactly to the amount. Defaults: 5% on tasks and marketplace sales, 3% vendor and ticket commission, editable by platform admins.

## Invariants checked in tests
Balanced entries, no overdraft with no partial entry left behind, idempotency, trial balance equals zero after 300 randomised events, escrow cannot release more than it holds.

## PPI (deferred)
`src/integrations/ppi.ts` defines `PpiAdapter` (top-up intent/confirm, payout request/status, KYC) with a `MockPpiAdapter`. The existing partner plugs in behind it; KC stays simulated until then. KC regulatory treatment must be settled with the partner before any real money flows (see section 8 of the product brief).

## Production port
Same account chart and rules in PostgreSQL: `journal_entries`, `postings` (with a deferred constraint that debits equal credits per entry), a unique index on the idempotency key, row-level locking on wallet accounts, and a nightly reconciliation against partner statements.
