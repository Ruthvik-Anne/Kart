# KART — Project Specification & Architecture Blueprint

**Version**: 1.0.0-rc1  
**Target Environment**: Next.js 16.4.0 (Turbopack) | React 19.0.0 | TypeScript 5.9.0 | PostgreSQL 16+  
**Repository Root**: `c:\Users\Vishnu\Downloads\Kart`  
**License**: Apache-2.0  

---

## 1. Executive Overview & System Vision

**KART** is an institutional campus commerce, peer-to-peer service, and micro-task marketplace platform designed for university ecosystems. The platform unifies physical retail (canteens, xerox/print shops, stationery, campus merchandise), student peer gig services (errands, tutoring, design, campus deliveries), and campus event ticketing into a single tokenized economy powered by Kart Coins (KC).

### Core Architectural Pillars
1. **Mathematical Financial Integrity**: An immutable double-entry journal ledger enforces zero-sum balance ($\sum \text{debits} \equiv \sum \text{credits}$), positive integer amounts, account-specific natural debit/credit conventions, strict overdraft protection, and append-only reversals.
2. **Cryptographic Tamper-Evidence**: A permissioned hash-chained audit logging notary anchors ledger entries into SHA-256 Merkle tree blocks chained to a 64-zero genesis block, capable of cryptographically proving historical immutability or alerting on post-anchor tampering.
3. **Deterministic State Automation**: A 10-state finite automaton manages the entire task marketplace lifecycle, binding milestone payments to escrow reservations, disputes, and releases.
4. **Defense-in-Depth Authorization**: Centralized Role-Based Access Control (RBAC) governing 4 platform roles, fine-grained capabilities (`providerEnabled`), 4 vendor store specializations, and 28 discrete permissions with ownership-scoped evaluations.
5. **Dual-Mode Execution Architecture**: A decoupled runtime capable of operating in 100% client-side demo mode (in-browser reactive mock database with `localStorage` persistence and multi-tab synchronization) or in full enterprise production mode (Node.js API route handlers, scrypt authentication, session hashing, and PostgreSQL transactions with pessimistic row-level locking).

---

## 2. System Architecture & Topology

### 2.1 Architectural Topology Diagram

```
                     ┌─────────────────────────────────────────────────────────┐
                     │                   Next.js 16 App Router                 │
                     │          (React 19 Server & Client Components)          │
                     └────────────────────────────┬────────────────────────────┘
                                                  │
                 ┌────────────────────────────────┴────────────────────────────────┐
                 │                                                                 │
      [Development / Demo Mode]                                        [Production / Server Mode]
                 │                                                                 │
                 ▼                                                                 ▼
      ┌──────────────────────┐                                         ┌──────────────────────┐
      │  StoreProvider.tsx   │                                         │ Next.js API Routes   │
      │ (Local Kart State)   │                                         │ (/api/session,       │
      └──────────┬───────────┘                                         │  /api/action)        │
                 │                                                     └──────────┬───────────┘
                 ▼                                                                ▼
      ┌──────────────────────┐                                         ┌──────────────────────┐
      │ Browser localStorage │                                         │ src/server/service.ts│
      │ (kart-web-db-v4)     │                                         │ (Action Gateway &    │
      └──────────────────────┘                                         │  viewFor Scrubber)   │
                                                                       └──────────┬───────────┘
                                                                                  │
                                                                                  ▼
                                                                       ┌──────────────────────┐
                                                                       │ PostgreSQL Database  │
                                                                       │ - campus_state       │
                                                                       │ - accounts (scrypt)  │
                                                                       │ - sessions (sha256)  │
                                                                       └──────────────────────┘
```

### 2.2 Dual-Mode Engine Architecture

| Dimension | In-Browser Demo Mode | PostgreSQL Production Mode |
|---|---|---|
| **Trigger Condition** | `DATABASE_URL` environment variable unset | `DATABASE_URL` configured in environment |
| **State Storage** | In-memory `Kart` class; serialized to `localStorage['kart-web-db-v4']` | PostgreSQL `campus_state` table storing JSONB document with optimistic/pessimistic lock |
| **Concurrency Control** | Single-threaded JavaScript event loop; multi-tab via `window.addEventListener('storage')` | `SELECT data FROM campus_state WHERE campus_id = $1 FOR UPDATE` row locks |
| **Identity & Auth** | Immediate client-side role switcher (`kart-web-session-v1`) | Salted `scrypt` hashing, 5-failure/15-min account lockout, 32-byte session token with SHA-256 DB hash |
| **API Boundary** | Direct method invocation on `Kart` instance via React Context | HTTP `POST /api/action` allow-list dispatch (`runAction`) validating CSRF, payload size, session actor |
| **Data Visibility** | Full client-side dataset access | Filtered snapshot returned via `viewFor(db, user)` stripping sensitive ledger entries, audit logs, orders, and messages |

---

## 3. Core Subsystems & Mathematical Specifications

### 3.1 Double-Entry General Ledger Subsystem (`src/ledger/`)

The KART ledger is implemented in `src/ledger/ledger.ts` and `src/ledger/rules.ts`. It maintains an append-only journal of balanced postings.

#### Invariant Equations & Rules
1. **Posting Cardinality & Quantization**:
   $$\forall e \in \text{Entries}, \quad |e.\text{postings}| \ge 2$$
   $$\forall p \in e.\text{postings}, \quad p.\text{amount} \in \mathbb{Z}^+ \quad (p.\text{amount} > 0)$$
2. **Zero-Sum Transaction Balance**:
   $$\sum_{p \in e, p.\text{side}=\text{debit}} p.\text{amount} = \sum_{p \in e, p.\text{side}=\text{credit}} p.\text{amount}$$
3. **Natural Account Sign & Derived Balances**:
   $$\text{sign}(account, side) = \begin{cases} +1 & \text{if } side = \text{'debit'} \land accountType \in \{\text{asset}, \text{expense}\} \\ -1 & \text{if } side = \text{'credit'} \land accountType \in \{\text{asset}, \text{expense}\} \\ +1 & \text{if } side = \text{'credit'} \land accountType \in \{\text{liability}, \text{equity}, \text{revenue}\} \\ -1 & \text{if } side = \text{'debit'} \land accountType \in \{\text{liability}, \text{equity}, \text{revenue}\} \end{cases}$$
   $$\text{Balance}(account) = \sum_{e \in \text{Entries}} \sum_{p \in e, p.\text{account}=account} \text{sign}(p.\text{account}, p.\text{side}) \times p.\text{amount}$$
4. **Strict Overdraft Prohibition & Atomic Rollback**:
   $$\forall a \in \{\text{USER\_WALLET}:*, \text{TASK\_ESCROW}:*, \text{VENDOR\_PAYABLE}:*\}, \quad \text{Balance}(a) \ge 0$$
   If any affected non-negative account balance drops below zero after appending an entry, the ledger executes `this.entries.pop()` and aborts with `LedgerError('Insufficient balance in ' + account)`.
5. **Idempotency & Reversals**:
   - Each transaction carries a unique idempotency key $e.\text{key}$. Existing keys return the prior entry without posting duplicate transfers.
   - Entries are strictly immutable. Corrections execute via `reverse(entryId, reason)` which creates a mirror entry flipping debit and credit sides with key `reverse:${entryId}`.

#### Account Chart
- **Assets (`debitNormal = true`)**: `PPI_PARTNER_FLOAT`
- **Liabilities (`creditNormal = true`)**: `USER_WALLET:{userId}`, `TASK_ESCROW:{taskId}`, `VENDOR_PAYABLE:{vendorId}`, `PENDING_SETTLEMENT`
- **Revenues (`creditNormal = true`)**: `PLATFORM_FEES`, `VENDOR_COMMISSION`
- **Expenses (`debitNormal = true`)**: `REFUNDS`, `PROMO_CREDITS`

---

### 3.2 Permissioned Hash-Chained Audit Notary (`src/chain/`)

The audit notary provides cryptographic proof of ledger immutability (`src/chain/chain.ts`).

#### Mathematical Construction
1. **Genesis Anchor**:
   $$\text{prevHash}_0 = \text{'0'}^{64} \quad (\text{64 lowercase hexadecimal zeros})$$
2. **Canonical Serialization**:
   $$\text{Canonical}(e) = \text{JSON.stringify}\left(\{ \text{id}: e.\text{id}, \text{key}: e.\text{key}, \text{type}: e.\text{type}, \text{ts}: e.\text{ts}, \text{postings}: \text{map}(p \to [p.\text{account}, p.\text{side}, p.\text{amount}]) \}\right)$$
3. **Entry Hashing**:
   $$H(e) = \text{SHA-256}(\text{Canonical}(e))$$
4. **Binary Merkle Tree Root**:
   - For a sequence of hashes $L = [h_0, h_1, \dots, h_{k-1}]$:
     - If $|L| = 0$, $\text{Root} = \text{'0'}^{64}$.
     - While $|L| > 1$:
       $$L' = \left[ \text{SHA-256}(L[2i] \mathbin{\Vert} (L[2i+1] \text{ if } 2i+1 < |L| \text{ else } L[2i])) \;\middle|\; 0 \le i < \lceil |L|/2 \rceil \right]$$
       $$L \leftarrow L'$$
     - $\text{Root} = L[0]$.
5. **Block Header & Chaining**:
   $$\text{Header}(B_n) = n \mathbin{\Vert} \text{'\|'} \mathbin{\Vert} B_n.\text{prevHash} \mathbin{\Vert} \text{'\|'} \mathbin{\Vert} B_n.\text{merkleRoot} \mathbin{\Vert} \text{'\|'} \mathbin{\Vert} B_n.\text{ts}$$
   $$B_n.\text{hash} = \text{SHA-256}(\text{Header}(B_n))$$
   $$B_n.\text{prevHash} = \begin{cases} \text{'0'}^{64} & n = 0 \\ B_{n-1}.\text{hash} & n > 0 \end{cases}$$
6. **Six-Property Verification Engine (`verifyChain`)**:
   - Validates (1) chain link consistency, (2) Merkle root integrity, (3) block header hash match, (4) presence of all anchored entries in live ledger, (5) exact cryptographic hash match between live entry and anchored hash, and (6) zero unanchored pending ledger entries.

---

### 3.3 Task Marketplace Finite State Machine (`src/domain/taskMachine.ts`)

The task marketplace implements a deterministic 10-state lifecycle:

```
[draft] ──(publish)──> [open] ──(first_bid)──> [bidding] ──(accept_bid)──> [assigned]
   │                     │                       │                              │
(cancel)              (cancel)                (cancel)                     (start_work)
   │                     │                       │                              │
   ▼                     ▼                       ▼                              ▼
[cancelled]           [cancelled]             [cancelled]                 [in_progress]
                                                                                │
                                                                           (submit_work)
                                                                                │
                                                                                ▼
[completed] <───────(approve)────────── [review] <──(request_changes)───────────┤
                                           │                                    │
                                     (open_dispute)                       (open_dispute)
                                           │                                    │
                                           ▼                                    ▼
[resolved] <──────(resolve_dispute)── [disputed] <──────────────────────────────┘
```

#### State Transition & Escrow Matrix

| Current State | Event | Next State | Permitted Actor | Required Permission | Financial Ledger Effect |
|---|---|---|---|---|---|
| `draft` | `publish` | `open` | Poster | `task:post` | None |
| `draft` | `cancel` | `cancelled` | Poster | `task:post` | None |
| `open` | `first_bid` | `bidding` | Bidder | `task:bid` | None |
| `open` | `accept_bid` | `assigned` | Poster | `task:approve` | `escrow_reserve` (dr Wallet, cr Escrow) |
| `open` | `cancel` | `cancelled` | Poster | `task:post` | None |
| `bidding` | `accept_bid` | `assigned` | Poster | `task:approve` | `escrow_reserve` (dr Wallet, cr Escrow) |
| `bidding` | `cancel` | `cancelled` | Poster | `task:post` | None |
| `assigned` | `start_work` | `in_progress` | Assignee | `task:bid` | None |
| `assigned` | `cancel` | `cancelled` | Poster | `task:post` | `escrow_refund` (dr Escrow, cr Wallet) |
| `assigned` | `open_dispute` | `disputed` | Either | `task:view` | None |
| `in_progress` | `submit_work` | `review` | Assignee | `task:bid` | None |
| `in_progress` | `cancel` | `cancelled` | Poster | `task:post` | `escrow_refund` (dr Escrow, cr Wallet) |
| `in_progress` | `open_dispute` | `disputed` | Either | `task:view` | None |
| `review` | `approve` | `completed` | Poster | `task:approve` | `escrow_release` (dr Escrow, cr Provider & Fee) |
| `review` | `request_changes` | `in_progress` | Poster | `task:approve` | None |
| `review` | `open_dispute` | `disputed` | Either | `task:view` | None |
| `disputed` | `resolve_dispute` | `resolved` | Platform Admin | `dispute:resolve` | Admin Decision: `refund_poster` or `release_provider` |

---

### 3.4 Role-Based Access Control Specification (`src/rbac/policy.ts`)

#### Roles & Capabilities
- **Platform Roles**:
  - `student`: Default campus user. Permitted to browse catalog, purchase items, request printing, post tasks, bid on tasks, register for events, and manage wallet.
  - `vendor`: Store operator. Bound to a specific `storeId` with one of 4 store types (`canteen`, `xerox`, `stationery`, `merch`). Permitted to manage inventory, update order statuses, and request settlement cashouts.
  - `campus_admin`: Institutional authority. Permitted to verify students for provider status, approve vendor onboarding applications, approve campus events, and view institutional analytics.
  - `platform_admin`: System superuser. Permitted to resolve escrow disputes, audit the financial ledger, anchor and verify cryptographic blocks, inspect fraud metrics, edit platform fee percentages, and audit accounts.
- **Dynamic Capabilities**:
  - `providerEnabled` (boolean flag on `student`): Grants capability `provider:hub`. Unlocked only after formal ID verification by a campus admin.

#### Permission Mapping Table

| Subsystem | Permission | student | vendor | campus_admin | platform_admin |
|---|---|:---:|:---:|:---:|:---:|
| **Commerce** | `catalog:view` | ✅ | ✅ | ✅ | ✅ |
| | `order:create` | ✅ | ❌ | ❌ | ❌ |
| | `order:view:own` | ✅ (scoped) | ❌ | ❌ | ❌ |
| | `print:create` | ✅ | ❌ | ❌ | ❌ |
| **Tasks & Comms** | `task:view` | ✅ | ❌ | ❌ | ❌ |
| | `task:post` | ✅ | ❌ | ❌ | ❌ |
| | `task:bid` | ✅ | ❌ | ❌ | ❌ |
| | `task:approve` | ✅ (scoped) | ❌ | ❌ | ❌ |
| | `thread:use` | ✅ (scoped) | ❌ | ❌ | ❌ |
| **Marketplace** | `service:offer` | ✅ | ❌ | ❌ | ❌ |
| | `listing:create` | ✅ | ❌ | ❌ | ❌ |
| | `event:register` | ✅ | ❌ | ❌ | ❌ |
| | `event:create` | ✅ | ❌ | ❌ | ❌ |
| | `wallet:view:own` | ✅ (scoped) | ❌ | ❌ | ❌ |
| **Provider** | `provider:hub` | If `providerEnabled` | ❌ | ❌ | ❌ |
| **Vendor Ops** | `store:manage` | ❌ | ✅ (scoped) | ❌ | ❌ |
| | `store:orders:update` | ❌ | ✅ (scoped) | ❌ | ❌ |
| | `store:settlements` | ❌ | ✅ (scoped) | ❌ | ❌ |
| **Campus Admin** | `user:verify` | ❌ | ❌ | ✅ | ✅ |
| | `vendor:approve` | ❌ | ❌ | ✅ | ❌ |
| | `event:approve` | ❌ | ❌ | ✅ | ❌ |
| | `campus:report` | ❌ | ❌ | ✅ | ❌ |
| **Platform Admin**| `dispute:resolve` | ❌ | ❌ | ❌ | ✅ |
| | `ledger:view:all` | ❌ | ❌ | ❌ | ✅ |
| | `chain:audit` | ❌ | ❌ | ❌ | ✅ |
| | `fraud:view` | ❌ | ❌ | ❌ | ✅ |
| | `user:roles` | ❌ | ❌ | ❌ | ✅ |
| | `fees:edit` | ❌ | ❌ | ❌ | ✅ |

---

## 4. Complete Feature Inventory (All 32 Features)

| # | Subsystem | Feature Name | Description | Inputs | Outputs | Invariant / Error Behavior |
|---|---|---|---|---|---|---|
| **1** | RBAC | Role Definition | 4 platform roles (`student`, `vendor`, `campus_admin`, `platform_admin`) | Role enum | Role type | Type error on invalid role string |
| **2** | RBAC | Vendor Store Types | 4 store specializations (`canteen`, `xerox`, `stationery`, `merch`) | StoreType enum | StoreType | Type error on unsupported store type |
| **3** | RBAC | Provider Capability | Student capability `providerEnabled` unlocking Provider Hub & bidding | User object | `provider:hub` permission | Omitted if student lacks campus verification |
| **4** | RBAC | Permission Set | 28 fine-grained `resource:action` permission identifiers | Permission enum | Permission type | Compile-time exhaustiveness check |
| **5** | RBAC | Role-Permission Matrix | Mapping of roles to permission lists (`ROLE_PERMISSIONS`) | Role | Array of `Permission` | Fallback empty set |
| **6** | RBAC | Resource Ownership Scoping | Scoping checks in `can()` for tasks, threads, stores, orders, wallets | User, Permission, Resource | `boolean` | Returns `false` on ownership mismatch |
| **7** | RBAC | Dynamic Navigation Filtering | `navFor(user)` filters sidebar entries by permission, role & store type | User | `NavItem[]` | Excludes unauthorized navigation items |
| **8** | RBAC | Route Guarding | `canVisit(user, pathname)` guards routes using longest prefix matching | User, pathname | `boolean` | Default-allow on unlisted routes; blocks unauthorized |
| **9** | RBAC | UI Route Interception | `Shell.tsx` intercepts unauthorized routes and renders HTTP 403 screen | User, current path | 403 Error Component | User redirected to role-specific home route |
| **10** | RBAC | Task Machine Guarding | Every task transition specifies required `Permission` and `Actor` role | TaskStatus, TaskEvent | `Transition` | Transition rejected if actor lacks permission |
| **11** | RBAC | Chat Thread Access Control | `canReadThread` restricts threads to poster and bidder; admin on dispute | Actor, threadKey | `boolean` | Returns `false`; logs audit event on illegal read |
| **12** | RBAC | Chat Authoring Restriction | Admins barred from authoring messages; only poster & bidder may send | Actor, threadKey, body | `Result` | Returns `{ ok: false, error: '...' }` |
| **13** | Audit | SHA-256 Digest | Cryptographic hashing of strings using Web Crypto `SHA-256` digest | Text string | 64-char hex string | Promise rejection on crypto API failure |
| **14** | Audit | Deterministic Canonical JSON | Strict deterministic JSON serialization with fixed key ordering | JournalEntry | Canonical JSON string | Guarantees reproducible hash across engines |
| **15** | Audit | Merkle Root Generation | Pairwise hashing of entry hashes to produce block Merkle root | `string[]` of hashes | 64-char root hash | Returns `GENESIS_HASH` if empty; duplicates odd leaf |
| **16** | Audit | Block Header Chaining | Header format `${index}\|${prevHash}\|${merkleRoot}\|${ts}` chained to prev | Block header fields | Block hash | Link broken if prevHash mismatch |
| **17** | Audit | Genesis Block Definition | 64 hexadecimal zeros as origin previous hash (`'0'.repeat(64)`) | Constant | Genesis hash string | Immutable zero root |
| **18** | Audit | Verification Engine | `verifyChain` validates links, roots, block hashes, and ledger entries | Chain, LedgerEntries | `VerifyResult` | Aggregates all anomalies in `problems` list |
| **19** | Audit | Tamper Simulation | `tamperDemo` alters anchored entry amount by +1 for verification demo | Actor (admin) | `Result` | Requires `chain:audit`; flags modified entry |
| **20** | Audit | Enterprise Chain Arch | Multi-org permissioned audit architecture spec (`kart-audit`) | Spec document | Architecture spec | Non-PII ledger hash anchor in Hyperledger Fabric |
| **21** | Auth | Demo Mode Authentication | Instant client-side role switcher without credentials | User ID | Switched session | Demo only; disabled when `DATABASE_URL` present |
| **22** | Auth | Salted scrypt Hashing | Random 16-byte salt, 64-byte scrypt key derivation | Password string | `scrypt:${salt}:${hash}` | Rejects < 12 or > 128 character passwords |
| **23** | Auth | Timing-Safe Comparison | `crypto.timingSafeEqual` prevents side-channel timing attacks | Actual & expected | `boolean` | Constant-time evaluation; returns `false` on mismatch |
| **24** | Auth | Brute-Force Lockout | 15-minute account lockout after 5 consecutive failed login attempts | Username, password | Lockout state in DB | Returns `null` on locked accounts |
| **25** | Auth | Session Token Generation | 32 cryptographically random bytes formatted as base64url | None | 256-bit token string | Cryptographically secure entropy pool |
| **26** | Auth | Database Token Hashing | Only `sha256(token)` stored in PostgreSQL `sessions.token_hash` | Token string | SHA-256 token hash | Raw token never persisted in database |
| **27** | Auth | Secure Session Cookie | HTTP-only, SameSite=Lax, secure in production, 7-day TTL cookie | Token string | Set-Cookie header | Browser cookie security enforcement |
| **28** | Auth | CSRF Origin Validation | Requires JSON content-type and matches origin host against host header | Request object | `boolean` | Rejects cross-origin POST |
| **29** | Auth | Payload Size Protection | Limits request body parsing to 200,000 bytes (200 KB) | Request object | Parsed JSON object | Returns empty object on excess length |
| **30** | Auth | Server Action Gateway | Executes allow-listed actions using session user identity as actor | Action name, args | `Result`, filtered DB | 401 on expired session; 400 on illegal action |
| **31** | Auth | Snapshot Data Scrubber | `viewFor` strips confidential data before sending state to browser | Full Db, User | Scoped Db snapshot | Redacts non-owned ledger entries & audit logs |
| **32** | Security | Attachment Sanitizer | `cleanAttachments` enforces extensions, size (10MB), and strips paths | FileLike array | Sanitized attachments | Error on invalid extension, size, or count > 5 |

---

## 5. Interface Contracts & API Specifications

### 5.1 HTTP API Endpoints

#### 1. `GET /api/session`
- **Description**: Returns session status, active user identity, and server mode flag.
- **Request Headers**: `Cookie: kart_session=<token>`
- **Response `200 OK`**:
  ```json
  {
    "server": true,
    "user": {
      "id": "u-student-1",
      "name": "Aarav Sharma",
      "roles": ["student"],
      "providerEnabled": true,
      "campusId": "main"
    },
    "db": { /* Scoped Db snapshot via viewFor() */ }
  }
  ```
- **Response (Unauthenticated)**: `200 OK` with `{ "server": true, "user": null }`.

#### 2. `POST /api/action`
- **Description**: Executes a domain mutation on behalf of the authenticated session user.
- **Headers**: `Content-Type: application/json`, `Cookie: kart_session=<token>`
- **Request Body**:
  ```json
  {
    "action": "placeOrder",
    "args": [{ "items": [{ "productId": "p-1", "quantity": 2 }], "notes": "No onions" }]
  }
  ```
- **Allow-List (`ACTIONS`)**: 45 allowed operations:
  `topUp`, `placeOrder`, `updateOrderStatus`, `requestPrint`, `updatePrintJob`, `postTask`, `updateTask`, `placeBid`, `acceptBid`, `startTaskWork`, `submitTaskWork`, `requestTaskChanges`, `approveTask`, `cancelTask`, `openDispute`, `resolveDispute`, `sendMessage`, `verifyUser`, `approveVendor`, `createListing`, `updateListing`, `buyListing`, `reserveRental`, `returnRental`, `cancelRental`, `requestSettlement`, `confirmSettlement`, `createEvent`, `approveEvent`, `registerEvent`, `checkInTicket`, `cancelTicket`, `applyPromo`, `createPromo`, `toggleWishlist`, `addReview`, `requestQuote`, `acceptQuote`, `declineQuote`, `scheduleTask`, `createWorkflow`, `updateWorkflowStep`, `cancelWorkflow`, `anchorBlock`, `tamperDemo`.
- **Response `200 OK`**:
  ```json
  {
    "result": { "ok": true, "orderId": "ord-9021" },
    "db": { /* Updated scoped Db snapshot */ }
  }
  ```
- **Errors**: `401 Unauthorized` (missing/invalid session), `400 Bad Request` (unknown action, payload > 200KB, CSRF origin mismatch).

### 5.2 PostgreSQL Database Schema Contract (`web/db/schema.sql`)

```sql
-- Campus state document store
CREATE TABLE IF NOT EXISTS campus_state (
  campus_id text PRIMARY KEY,
  data jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- User authentication accounts
CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY,
  campus_id text NOT NULL REFERENCES campus_state(campus_id) ON DELETE CASCADE,
  username text NOT NULL,
  password_hash text NOT NULL,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campus_id, username)
);

-- Active authenticated sessions
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
```

---

## 6. Code Layout & Repository Structure

```
c:\Users\Vishnu\Downloads\Kart\
├── .github/
│   └── workflows/
│       └── web.yml               # GitHub Actions CI (Node 24, lint, test, build, e2e)
├── .agents/                      # Teamwork multi-agent coordination workspace
├── package.json                  # Root npm scripts delegating to web/
├── README.md                     # Project overview and run instructions
├── LICENSE                       # Apache-2.0
├── PROJECT.md                    # Canonical project specification (This document)
├── KART_AUDIT_REPORT.md          # Comprehensive publication-grade repository audit report
└── web/                          # Main web application package
    ├── package.json              # Next.js 16, React 19, Vitest, Tailwind, pg
    ├── tsconfig.json             # TypeScript 5.9 strict configuration
    ├── next.config.ts            # Next.js Turbopack configuration
    ├── db/
    │   └── schema.sql            # PostgreSQL DDL (campus_state, accounts, sessions)
    ├── docs/                     # Architectural design specifications
    │   ├── chain-design.md       # Audit notary and Merkle tree specification
    │   ├── ledger.md             # Financial accounting specification
    │   ├── rbac.md               # Role and permission policy specification
    │   └── task-comms.md         # Task chat and notification specification
    ├── e2e/                      # Puppeteer end-to-end browser automation suites
    │   ├── e2e.mjs               # Core user journeys
    │   ├── features.mjs          # Advanced workflow, attachments, negotiations
    │   └── retail.mjs           # Retail checkout, promo codes, reviews
    ├── scripts/
    │   └── db.ts                 # CLI database migration and account seeder
    └── src/
        ├── app/                  # Next.js 16 App Router (41 routes)
        │   ├── (app)/            # Application routes wrapped in Shell & CartProvider
        │   │   ├── admin/        # Platform & Campus admin consoles
        │   │   ├── vendor/       # Vendor operations (inventory, menu, queue, settlements)
        │   │   ├── dashboard/    # Student dashboard
        │   │   ├── tasks/        # Task marketplace & task details
        │   │   ├── shop/         # Retail shopping catalog
        │   │   ├── food/         # Campus canteen food ordering
        │   │   ├── xerox/        # Campus print & document services
        │   │   ├── marketplace/  # Peer-to-peer buy/sell/rent listings
        │   │   ├── events/       # Campus event registration & ticketing
        │   │   ├── messages/     # Direct task messaging threads
        │   │   ├── wallet/       # KC wallet balance, ledger transactions, top-up
        │   │   └── ...           # notifications, wishlist, settings, reviews
        │   ├── api/
        │   │   ├── action/       # POST /api/action route handler
        │   │   └── session/      # GET /api/session route handler
        │   ├── layout.tsx        # Root layout loading typography and StoreProvider
        │   └── page.tsx          # Landing page
        ├── chain/                # Permissioned blockchain audit layer
        │   ├── chain.ts          # Merkle tree, canonical JSON, block hashing, verifyChain
        │   └── chain.test.ts     # 5 Vitest tests verifying audit chain integrity
        ├── components/           # UI Component library
        │   ├── Shell.tsx         # Responsive application shell, navigation, 403 guard
        │   ├── CartProvider.tsx  # Multi-store retail cart context
        │   ├── CartModal.tsx     # Checkout modal with promo code application
        │   ├── Catalog.tsx       # Product grid with category filters
        │   ├── ChatThread.tsx    # Real-time task chat component
        │   ├── FilePicker.tsx    # Drag-and-drop attachment upload component
        │   ├── StarRating.tsx    # Interactive 5-star rating component
        │   ├── TaskCard.tsx      # Task card with priority/match score badges
        │   ├── VendorOrders.tsx  # Vendor queue and status management
        │   └── ui/               # Primitives (Button, Modal, Input, Badge, Card, Empty)
        ├── domain/               # Core business state machines
        │   ├── taskMachine.ts    # 10-state task finite automaton
        │   └── taskMachine.test.ts # 8 Vitest tests verifying state transitions
        ├── integrations/         # External partner interfaces
        │   └── ppi.ts            # Payment Partner Interface (PpiAdapter, MockPpiAdapter)
        ├── ledger/               # Double-entry general ledger
        │   ├── ledger.ts         # Ledger engine, posting balance validation, overdraft guard
        │   ├── rules.ts          # Business transaction templates (checkout, escrow, refund)
        │   └── ledger.test.ts    # 12 Vitest tests + 300-iteration Monte Carlo simulation
        ├── lib/                  # Mathematical and formatting utilities
        │   ├── attachments.ts    # File attachment sanitization and size validation
        │   ├── attachments.test.ts # 7 Vitest tests
        │   ├── promo.ts          # Multi-store integer discount splitting & validations
        │   ├── promo.test.ts     # 7 Vitest tests
        │   ├── scoring.ts        # Priority scores, bid match scores, Bayesian ratings
        │   ├── scoring.test.ts   # 12 Vitest tests
        │   ├── theme.ts          # Theme switcher (light, dark, system) & FOUC script
        │   └── theme.test.ts     # 3 Vitest tests
        ├── mock/                 # In-browser reactive mock database
        │   ├── db.ts             # 24 collections, 45 mutating operations, seed data
        │   ├── StoreProvider.tsx # React Context provider with localStorage sync
        │   ├── db.test.ts        # 36 Vitest tests verifying full mock lifecycle
        │   ├── features.test.ts  # 21 Vitest tests verifying advanced features
        │   └── retail.test.ts    # 14 Vitest tests verifying retail & promo flows
        ├── rbac/                 # Role-based access control policies
        │   ├── policy.ts         # 4 roles, 28 permissions, scoping, navigation, route guards
        │   └── policy.test.ts    # 18 Vitest tests verifying permissions & route guards
        └── server/               # PostgreSQL server integration
            ├── database.ts       # pg.Pool connection wrapper
            ├── pgStore.ts        # Transactional JSONB document store with row locks
            ├── auth.ts           # scrypt hashing, brute-force lockout, session tokens
            ├── service.ts        # Action allow-list gateway & viewFor snapshot scrubber
            ├── http.ts           # CSRF sameOrigin verification & payload parsing
            ├── auth.test.ts      # 6 Vitest tests verifying authentication security
            └── service.test.ts   # 9 Vitest tests verifying server action gateway
```

---

## 7. Milestones & Delivery Roadmap

### Phase 1: MVP In-Browser Campus Prototype (Status: COMPLETED)
- [x] In-browser mock database (`Kart`) with 24 reactive collections.
- [x] Full UI with 41 App Router pages and responsive navigation shell.
- [x] Multi-store retail catalog, food ordering, and xerox print request workflows.
- [x] Peer-to-peer task marketplace with 10-state finite automaton.
- [x] Double-entry ledger core with zero-sum enforcement and overdraft rejection.
- [x] Cryptographic hash-chained audit logging layer with Merkle root computation.
- [x] Client-side RBAC policy engine and route guarding.

### Phase 2: PostgreSQL State-Document Engine (Status: COMPLETED)
- [x] PostgreSQL relational schema (`campus_state`, `accounts`, `sessions`).
- [x] Pessimistic row locking concurrency control (`FOR UPDATE`).
- [x] Production authentication: salted `scrypt`, timing-safe checks, 5-failure lockout.
- [x] Cryptographic session tokens with SHA-256 database storage and HTTP-only cookies.
- [x] CSRF same-origin verification and 200KB payload protection.
- [x] Action allow-list gateway (`runAction`) and per-user snapshot scrubber (`viewFor`).
- [x] Complete Vitest test suite (13 test files, 158 tests passing).

### Phase 3: Immediate Production Hardening (Status: CURRENT)
- [ ] **Multi-Tenancy Partitioning**: Remove hardcoded `CAMPUS = 'main'`; resolve campus from subdomain or authenticated user profile.
- [ ] **Action Allow-List Parity**: Add missing `withdrawListing` to `service.ts:ACTIONS`.
- [ ] **Default-Deny Route Guarding**: Refactor `canVisit()` in `src/rbac/policy.ts` to reject unlisted routes by default rather than allowing access.
- [ ] **User List Sanitization**: Scrub user directory in `viewFor()` to prevent student enumeration.
- [ ] **Dynamic Role Administration**: Implement mutating server action for `user:roles` allowing platform admins to modify account privileges.

### Phase 4: Enterprise Scale & Institutional Integrations (Status: PLANNED)
- [ ] **Relational Journal Migration**: Decompose single `campus_state` JSONB document into relational `journal_entries` and `postings` tables with row-level account locks to eliminate serial row contention.
- [ ] **Live Banking / PPI Bridge**: Replace `MockPpiAdapter` with real institutional payment gateway (Razorpay / UPI / Decentro) for automated INR top-up and vendor payouts.
- [ ] **Institutional SSO**: Integrate SAML 2.0 / OIDC / OAuth2 with university identity providers (Azure AD / Google Workspace for Education).
- [ ] **Object Storage Integration**: Migrate base64/metadata attachment storage to Amazon S3 or Google Cloud Storage with presigned upload URLs.
- [ ] **Permissioned Consortium Audit Channel**: Deploy Hyperledger Fabric audit channel with Raft ordering across university and banking partner nodes.
