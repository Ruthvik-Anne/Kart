# Domain Invariants, Business Logic & Test Suite Verification Report

## 1. Observation

### 1.1 Test Suite & Verification Commands
- **Command executed**: `cmd.exe /c "npm test"` (which executes `npm --prefix web test` -> `vitest run`).
  - **Result**: 13 of 13 test files passed, 158 of 158 tests passed in 1.19s – 4.31s.
- **Command executed**: `cmd.exe /c "npm run lint"` (which executes `npm --prefix web run lint` -> `tsc --noEmit`).
  - **Result**: Exit code 0, 0 TypeScript compiler errors.

### 1.2 Inventory of Vitest Test Files
The project contains exactly 13 test files located in `web/src`:

| # | Test File Path | Test Count | Module Tested | Primary Focus |
|---|---|---|---|---|
| 1 | `web/src/chain/chain.test.ts` | 5 | `web/src/chain/chain.ts` | Genesis block, Merkle root verification, hash-link integrity, post-anchor tampering detection, unanchored entry detection |
| 2 | `web/src/domain/taskMachine.test.ts` | 8 | `web/src/domain/taskMachine.ts` | Task status transitions, terminal states, illegal transition rejections, actor permissions, escrow effects, milestone counts |
| 3 | `web/src/ledger/ledger.test.ts` | 12 | `web/src/ledger/ledger.ts`, `rules.ts` | Zero-sum balance rule, non-integer rejection, idempotency, overdraft rollback, business flows (checkout, refund, milestone release, settlement), 300-iteration randomized trial balance simulation |
| 4 | `web/src/lib/attachments.test.ts` | 7 | `web/src/lib/attachments.ts` | Extension allow-list, size caps (10MB), count caps (5), path-traversal/control character stripping (`safeName`), format sizing |
| 5 | `web/src/lib/promo.test.ts` | 7 | `web/src/lib/promo.ts` | Percentage & flat discounts, minimum subtotal, percentage cap, multi-store proportional discount integer splitting, promo definition schema validation |
| 6 | `web/src/lib/scoring.test.ts` | 12 | `web/src/lib/scoring.ts` | Task priority score (0-100), bid match score (0-100), Bayesian rating smoothing, urgency boost, fee & net payout calculations |
| 7 | `web/src/lib/theme.test.ts` | 3 | `web/src/lib/theme.ts` | Explicit light/dark, system preference resolution, stored theme validation, zero-FOUC init script |
| 8 | `web/src/mock/db.test.ts` | 36 | `web/src/mock/db.ts` | Seed funding, retail checkout & print requests, task lifecycle with escrow, scoring integration, private chat scoping & contact filtering, admin & audit chain anchoring, buy/sell/rent marketplace escrow, campus events/tickets, vendor onboarding |
| 9 | `web/src/mock/features.test.ts` | 21 | `web/src/mock/db.ts` | Attachments metadata on tasks/messages, counter-offers/quotes negotiation, scheduled task start delays, recurring series progression, linked workflow step locking & cancellation cascade, bilateral reviews, notification isolation |
| 10 | `web/src/mock/retail.test.ts` | 14 | `web/src/mock/db.ts`, `lib/promo.ts` | Platform-funded promo accounting (`PROMO_CREDITS`), per-user redemption limit, minimum subtotal, multi-store order balancing, cancellation restoration, 50-item wishlist toggle, verified-buyer product reviews & averaging |
| 11 | `web/src/rbac/policy.test.ts` | 18 | `web/src/rbac/policy.ts` | Role permissions (`can()`), ownership & resource scoping, dynamic navigation filtering (`navFor`), route guards (`guardFor`, `canVisit`), home redirects (`homeFor`) |
| 12 | `web/src/server/auth.test.ts` | 6 | `web/src/server/auth.ts` | Username/password validation, salted scrypt password hashing, timing-safe equality, token hashing, 5-failure account lockout (15 min), input sanitization |
| 13 | `web/src/server/service.test.ts` | 9 | `web/src/server/service.ts` | Allow-list action enforcement (45 actions), prototype pollution prevention, transactional concurrency serialization, RBAC enforcement on server, per-user view sanitization (`viewFor`) |

### 1.3 Double-Entry Ledger Source Code Observations (`web/src/ledger/ledger.ts`, `rules.ts`)
- **Ledger Invariant 1: Zero-Sum Balanced Entries**:
  - `web/src/ledger/ledger.ts:69-75`:
    ```typescript
    if (postings.length < 2) throw new LedgerError('An entry needs at least two postings.');
    if (postings.some(p => !Number.isInteger(p.amount) || p.amount <= 0)) {
      throw new LedgerError('Posting amounts must be positive integers.');
    }
    const debits = postings.filter(p => p.side === 'debit').reduce((a, p) => a + p.amount, 0);
    const credits = postings.filter(p => p.side === 'credit').reduce((a, p) => a + p.amount, 0);
    if (debits !== credits) throw new LedgerError(`Unbalanced entry: debits ${debits} != credits ${credits}.`);
    ```
- **Ledger Invariant 2: Derived Balances by Natural Account Direction**:
  - `web/src/ledger/ledger.ts:17-22`:
    ```typescript
    export function accountType(account: string): AccountType {
      if (account === ACCOUNTS.ppiFloat) return 'asset';
      if (account === ACCOUNTS.platformFees || account === ACCOUNTS.vendorCommission) return 'revenue';
      if (account === ACCOUNTS.refunds || account === ACCOUNTS.promo) return 'expense';
      return 'liability';
    }
    ```
  - `web/src/ledger/ledger.ts:46-57`:
    ```typescript
    balance(account: string): number {
      const debitNormal = accountType(account) === 'asset' || accountType(account) === 'expense';
      let sum = 0;
      for (const e of this.entries) {
        for (const p of e.postings) {
          if (p.account !== account) continue;
          const sign = (p.side === 'debit') === debitNormal ? 1 : -1;
          sum += sign * p.amount;
        }
      }
      return sum;
    }
    ```
- **Ledger Invariant 3: Overdraft Rejection & Atomic Rollback**:
  - `web/src/ledger/ledger.ts:25-26`:
    ```typescript
    const nonNegative = (account: string) =>
      account.startsWith('USER_WALLET:') || account.startsWith('TASK_ESCROW:') || account.startsWith('VENDOR_PAYABLE:');
    ```
  - `web/src/ledger/ledger.ts:82-88`:
    ```typescript
    this.entries.push(entry);
    for (const account of new Set(postings.map(p => p.account))) {
      if (nonNegative(account) && this.balance(account) < 0) {
        this.entries.pop();
        throw new LedgerError(`Insufficient balance in ${account}.`);
      }
    }
    this.keys.add(input.key);
    ```
- **Ledger Invariant 4: Idempotency & Immutability**:
  - `web/src/ledger/ledger.ts:65-66`: If `this.entries.find(e => e.key === input.key)` exists, it immediately returns the existing entry without re-posting.
  - Reversals: `web/src/ledger/ledger.ts:100-108`: `reverse(entryId, reason)` posts the inverse entry with flipped debit/credit sides under key `reverse:${entryId}`. Original entries are never edited or deleted.
- **Posting Rules & Account Chart (`web/src/ledger/rules.ts:12-76`)**:
  - `topUp`: `dr(PPI_PARTNER_FLOAT)`, `cr(USER_WALLET:{userId})`.
  - `checkout`: `dr(USER_WALLET:{buyerId}, amount - discount)`, `dr(PROMO_CREDITS, discount)`, `cr(VENDOR_PAYABLE:{vendorId}, amount - commission)`, `cr(VENDOR_COMMISSION, commission)`.
  - `orderRefund`: `dr(VENDOR_PAYABLE:{vendorId}, amount - commission)`, `dr(VENDOR_COMMISSION, commission)`, `cr(USER_WALLET:{buyerId}, amount - discount)`, `cr(PROMO_CREDITS, discount)`.
  - `escrowReserve`: `dr(USER_WALLET:{posterId})`, `cr(TASK_ESCROW:{taskId})`.
  - `escrowRelease`: `dr(TASK_ESCROW:{taskId})`, `cr(USER_WALLET:{providerId}, amount - fee)`, `cr(PLATFORM_FEES, fee)`.
  - `escrowRefund`: `dr(TASK_ESCROW:{taskId})`, `cr(USER_WALLET:{posterId})`.
  - `eventTicket`: `dr(USER_WALLET:{buyerId})`, `cr(USER_WALLET:{hostId}, amount - commission)`, `cr(VENDOR_COMMISSION, commission)`.
  - `vendorSettlement`: `dr(VENDOR_PAYABLE:{vendorId})`, `cr(PENDING_SETTLEMENT)`.
  - `settlementConfirmed`: `dr(PENDING_SETTLEMENT)`, `cr(PPI_PARTNER_FLOAT)`.
  - `cashOut`: `dr(USER_WALLET:{userId})`, `cr(PENDING_SETTLEMENT)`.
  - Fee Calculation: `Math.ceil(amount * rate)` guarantees platform fee rounding in platform's favor, ensuring splits sum exactly to `amount`.

### 1.4 Task Marketplace State Machine Observations (`web/src/domain/taskMachine.ts`)
- **Status Enum**: `draft`, `open`, `bidding`, `assigned`, `in_progress`, `review`, `completed`, `cancelled`, `disputed`, `resolved`.
- **Terminal States**: `completed`, `cancelled`, `resolved` (all have `isTerminal(s) === true` and empty transition maps `{}`).
- **Event Transition Matrix**:
  - `draft + publish -> open` (poster, `task:post`, effect: `none`)
  - `draft + cancel -> cancelled` (poster, `task:post`, effect: `none`)
  - `open + first_bid -> bidding` (bidder, `task:bid`, effect: `none`)
  - `open + accept_bid -> assigned` (poster, `task:approve`, effect: `escrow_reserve`) [urgent instant-accept]
  - `open + cancel -> cancelled` (poster, `task:post`, effect: `none`)
  - `bidding + accept_bid -> assigned` (poster, `task:approve`, effect: `escrow_reserve`)
  - `bidding + cancel -> cancelled` (poster, `task:post`, effect: `none`)
  - `assigned + start_work -> in_progress` (assignee, `task:bid`, effect: `none`)
  - `assigned + cancel -> cancelled` (poster, `task:post`, effect: `escrow_refund`)
  - `assigned + open_dispute -> disputed` (either, `task:view`, effect: `none`)
  - `in_progress + submit_work -> review` (assignee, `task:bid`, effect: `none`)
  - `in_progress + cancel -> cancelled` (poster, `task:post`, effect: `escrow_refund`)
  - `in_progress + open_dispute -> disputed` (either, `task:view`, effect: `none`)
  - `review + approve -> completed` (poster, `task:approve`, effect: `escrow_release`)
  - `review + request_changes -> in_progress` (poster, `task:approve`, effect: `none`)
  - `review + open_dispute -> disputed` (either, `task:view`, effect: `none`)
  - `disputed + resolve_dispute -> resolved` (admin, `dispute:resolve`, effect: resolved in mock DB handler: `refund_poster` or `release_provider`)
- **Task Kinds & Milestone Rules (`web/src/domain/taskMachine.ts:55-61`)**:
  - `urgent`: window $\le 6$ hours, milestone count $\le 1$.
  - `normal`: window $\le 72$ hours, milestone count $\ge 1$.
  - `long_term`: window $> 72$ hours (up to 336h), milestone count $\ge 2$.

### 1.5 Retail, Promo Codes, Scoring/Reputation, and Theme Observations
- **Promo Codes (`web/src/lib/promo.ts`)**:
  - Platform-funded discount: `PROMO_CREDITS` expense account debited.
  - Subtotal check: `subtotal < promo.min` returns 0 discount.
  - Discount caps: `Math.min(promo.cap, Math.round(subtotal * promo.value / 100))`.
  - Multi-store proportional split: `splitDiscount(discount, shares)` computes integer shares via `Math.floor(discount * s / total)`, remainder given to last store, guaranteeing sum of parts equals total discount.
  - Per-user limit: `db.promoUses.some(u => u.code === promo.code && u.userId === actor.id)`.
  - Global redemptions: `db.promoUses.filter(...).length >= promo.maxUses`.
- **Scoring & Reputation (`web/src/lib/scoring.ts`)**:
  - Priority Score: $100 \times (0.40 \times \text{urgency} + 0.25 \times \text{budget} + 0.20 \times \text{trust} + 0.15 \times \text{age}) + (\text{urgent} ? 10 : 0)$, capped at 100.
  - Match Score: $100 \times (0.30 \times \text{price} + 0.25 \times \text{reputation} + 0.20 \times \text{availability} + 0.15 \times \text{experience} + 0.10 \times \text{speed})$.
  - Bayesian rating smoothing: $\text{smoothed} = \frac{\text{rating} \times \text{count} + 4.0 \times 5}{\text{count} + 5}$.
- **Theme Subsystem (`web/src/lib/theme.ts`)**:
  - Choices: `light`, `dark`, `system`. Stored in `localStorage` under `kart-theme`.
  - `THEME_INIT_SCRIPT` runs inline before first paint to prevent flash of wrong theme.

---

## 2. Logic Chain

1. **Premise**: Financial integrity in campus commerce requires that no money is created or destroyed, no user or escrow balance goes negative, and every mutation is idempotent and reversible.
   - **From Observation 1.3**: `Ledger.post` requires $\ge 2$ postings with positive integer amounts and enforces $\sum \text{debits} == \sum \text{credits}$. If unbalanced, it throws `LedgerError`.
   - **From Observation 1.3**: Before committing, `Ledger.post` tests all mutated accounts. If any account matching `USER_WALLET:*`, `TASK_ESCROW:*`, or `VENDOR_PAYABLE:*` has a balance $< 0$, the entry is immediately popped (`this.entries.pop()`), leaving no partial postings behind.
   - **From Observation 1.1 & 1.2 (`web/src/ledger/ledger.test.ts`)**: A randomized Monte Carlo simulation executing 300 arbitrary financial transactions (checkouts, escrow reservations, releases, refunds, cashouts) proved that `trialBalance().balanced` is strictly true on every single step and zero wallets go negative.
   - **Conclusion on Ledger**: The double-entry ledger is mathematically sound, self-balancing, zero-sum, and overdraft-proof.

2. **Premise**: The Task Marketplace must prevent premature payouts, unauthorized bid acceptance, and deadlocks in disputed states.
   - **From Observation 1.4**: In `web/src/domain/taskMachine.ts`, transitions are strictly mapped. Funds are only reserved upon transition to `assigned` (`accept_bid` trigger) and released only upon poster approval in `review` (`approve` trigger).
   - **From Observation 1.4**: Cancelling a task in `assigned` or `in_progress` triggers `escrow_refund`, returning all remaining escrow to the poster. Once work is submitted for `review`, direct cancellation is disallowed; the poster must either `request_changes` or `open_dispute`.
   - **From Observation 1.4**: Only `dispute:resolve` (held strictly by `platform_admin`) can transition a task from `disputed` to `resolved`, at which point the admin specifies either `refund_poster` or `release_provider`.
   - **Conclusion on Task Machine**: The state machine strictly guarantees that escrowed money cannot be leaked, released prematurely, or trapped without administrative resolution.

3. **Premise**: Retail orders with multi-store carts and promo codes must not corrupt the platform's financial books.
   - **From Observation 1.5 & `web/src/mock/retail.test.ts`**: When a buyer uses a promo code across multiple stores, the discount is subsidized by `PROMO_CREDITS` (platform expense). The vendor still receives their full gross subtotal minus vendor commission.
   - **From Observation 1.5**: `splitDiscount()` guarantees that integer rounding does not drop or gain a single KC cent across multiple stores.
   - **From Observation 1.5**: If an order is cancelled while in `Placed` status, `orderRefund` reverses the postings, restores the buyer wallet and `PROMO_CREDITS`, and reinstates promo code eligibility.
   - **Conclusion on Retail**: The retail checkout and promo subsystem preserves ledger balance across complex multi-store splits.

4. **Premise**: Automated test coverage must verify every critical business invariant and security constraint.
   - **From Observation 1.2**: All 13 test files cover unit and integration layers across all subsystems (chain, taskMachine, ledger, attachments, promo, scoring, theme, mock db, advanced features, retail, RBAC policy, auth, service).
   - **From Observation 1.1**: All 158 tests pass cleanly.

---

## 3. Caveats

1. **Storage Mode Architecture (Mock DB vs Server Mode)**:
   - In demo mode, the state is held in an in-memory `Kart` instance backed by browser `localStorage`.
   - In server mode (`pgStore.ts`), the entire campus state is stored as a single JSONB blob in `campus_state.data` and locked with `SELECT data FROM campus_state WHERE campus_id = $1 FOR UPDATE`.
   - While this ensures strict ACID transactional isolation and serializability, high-frequency concurrent traffic will contend on this single row lock. The relational schema outlined in `docs/ledger.md` (`journal_entries` and `postings` tables with row-level account locks) is designed for a future migration.
2. **Puppeteer E2E Tests**:
   - The repository contains 3 Puppeteer end-to-end test scripts in `web/e2e/` (`e2e.mjs`, `features.mjs`, `retail.mjs`). These are executed via `npm run test:e2e` and require a running web server on port 3100 with Google Chrome installed. They are complementary to the 13 Vitest files and do not run under `npm test`.
3. **External PPI Payment Integration**:
   - As documented in `web/docs/ledger.md` and `src/mock/db.ts:1156`, KC tokens are currently simulated within the platform. Real PPI payment provider hooks (`PpiAdapter`) are mocked (`MockPpiAdapter`). Real INR settlement requires regulatory finalization before live deployment.

---

## 4. Conclusion

1. **Double-Entry Ledger Subsystem**: Verified. Fully compliant with zero-sum invariant ($\sum \text{debits} == \sum \text{credits}$), positive integer amounts, derived balances according to natural account direction, strict overdraft rejection with immediate rollback, idempotency on transaction keys, and append-only reversals.
2. **Task Marketplace State Machine**: Verified. Strictly defined deterministic transitions across 10 states, role/actor permission checks on every step, automated escrow reservation on bid acceptance, milestone-by-milestone releases net of platform fee on approval, cancellation refunds, and platform-admin-only dispute resolution.
3. **Retail, Promo, Scoring & Theme Subsystems**: Verified. Multi-store cart splitting is mathematically exact, promo discounts are platform-subsidized without unbalancing vendor books, scoring applies Bayesian smoothing to prevent review gaming, and theme selection prevents FOUC.
4. **Test Suite Verification**: Verified. All 13 Vitest test files pass 100% (158/158 tests passing). `tsc --noEmit` compiles with 0 errors.

---

## 5. Verification Method

To independently reproduce and verify this investigation, run the following commands in PowerShell from the project root (`c:\Users\Vishnu\Downloads\Kart`):

### 1. Run the Full Automated Test Suite (All 13 Vitest Files)
```powershell
cmd.exe /c "npm test"
```
**Expected Output**:
- 13 passed test files (`chain.test.ts`, `taskMachine.test.ts`, `ledger.test.ts`, `attachments.test.ts`, `promo.test.ts`, `scoring.test.ts`, `theme.test.ts`, `db.test.ts`, `features.test.ts`, `retail.test.ts`, `policy.test.ts`, `auth.test.ts`, `service.test.ts`).
- 158 passed tests.
- Exit code 0.

### 2. Verify TypeScript Compilation & Types
```powershell
cmd.exe /c "npm run lint"
```
**Expected Output**:
- `tsc --noEmit` exits with code 0 and zero diagnostic errors.

### 3. Inspect Invariant Code Locations
- Open `web/src/ledger/ledger.ts:69-88` to inspect zero-sum validation and overdraft rollback.
- Open `web/src/ledger/rules.ts:18-31` to inspect order checkout and refund ledger postings.
- Open `web/src/domain/taskMachine.ts:20-48` to inspect the transition matrix and actor permission requirements.
- Open `web/src/lib/promo.ts:26-36` to inspect multi-store integer discount splitting.
- Open `web/src/server/service.ts:7-37` to inspect server action dispatch and transactional locking.

### 4. Invalidation Conditions
- Any change to `Ledger.post` that permits debits $\neq$ credits or allows `balance(account) < 0` for non-negative accounts without rolling back.
- Any change to `taskMachine.ts` that allows unauthorized actors to approve milestones or permits escrow release without poster approval.
- Any discrepancy between `ACTIONS` in `service.ts` and mutating methods on `Kart`.
