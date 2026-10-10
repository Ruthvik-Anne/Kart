# Security, RBAC & Audit Logging Specification Report

**Artifact**: Specification and Security Verification Report  
**Author**: Security & RBAC Spec Miner  
**Target Path**: `c:\Users\Vishnu\Downloads\Kart\.agents\teamwork\spec_miner_security\handoff.md`  
**Date**: 2026-10-10  

---

## 1. Observation

Direct code and test observations from authoritative source files across `web/src`:

### 1.1 RBAC Subsystem (`web/src/rbac/policy.ts`, `web/docs/rbac.md`, `web/src/components/Shell.tsx`)
- **Roles**: 4 core roles defined in `Role` (`policy.ts:4`):
  ```ts
  export type Role = 'student' | 'vendor' | 'campus_admin' | 'platform_admin';
  ```
- **Store Types**: 4 vendor store sub-types defined in `StoreType` (`policy.ts:5`):
  ```ts
  export type StoreType = 'canteen' | 'xerox' | 'stationery' | 'merch';
  ```
- **Capabilities vs. Roles**: "Capabilities are not roles. `providerEnabled` on a student unlocks the Provider Hub, service listings and bidding rights after campus-admin verification." (`docs/rbac.md:7`, `policy.ts:36,47`).
- **Permissions**: Exactly 28 permissions in `Permission` (`policy.ts:7-14`):
  - Catalog & Ordering: `catalog:view`, `order:create`, `order:view:own`, `print:create`
  - Task & Messaging: `task:view`, `task:post`, `task:bid`, `task:approve`, `thread:use`
  - Marketplace & Events: `service:offer`, `listing:create`, `event:register`, `event:create`, `wallet:view:own`
  - Provider Capability: `provider:hub`
  - Store Operations: `store:manage`, `store:orders:update`, `store:settlements`
  - Campus Administration: `user:verify`, `vendor:approve`, `event:approve`, `campus:report`
  - Platform Administration: `dispute:resolve`, `ledger:view:all`, `chain:audit`, `fraud:view`, `user:roles`, `fees:edit`
- **Role-to-Permission Mapping (`ROLE_PERMISSIONS`)** (`policy.ts:16-30`):
  - `student`: 14 permissions (`catalog:view`, `order:create`, `order:view:own`, `print:create`, `task:view`, `task:post`, `task:bid`, `task:approve`, `thread:use`, `service:offer`, `listing:create`, `event:register`, `event:create`, `wallet:view:own`). When `providerEnabled === true`, adds `provider:hub` (15 total).
  - `vendor`: 4 permissions (`catalog:view`, `store:manage`, `store:orders:update`, `store:settlements`).
  - `campus_admin`: 5 permissions (`catalog:view`, `user:verify`, `vendor:approve`, `event:approve`, `campus:report`).
  - `platform_admin`: 8 permissions (`catalog:view`, `dispute:resolve`, `ledger:view:all`, `chain:audit`, `fraud:view`, `user:roles`, `fees:edit`, `user:verify`). Note: `platform_admin` shares `user:verify` with `campus_admin`.
- **Resource Ownership Scoping (`can()`)** (`policy.ts:52-70`):
  - `task:approve`: `resource.ownerId === user.id`
  - `thread:use`: `resource.ownerId === user.id || resource.assigneeId === user.id`
  - `store:orders:update`, `store:manage`, `store:settlements`: `!!user.storeId && resource.storeId === user.storeId`
  - `order:view:own`, `wallet:view:own`: `resource.ownerId === user.id`
- **Dynamic Navigation & Route Guards**:
  - `NAV`: 27 registered entries across sections `Campus`, `Work`, `Store`, `More`, `Admin`, `Hidden`.
  - `guardFor(pathname)` (`policy.ts:132-135`): Matches longest `href` prefix among `NAV` entries.
  - `canVisit(user, pathname)` (`policy.ts:137-141`): Returns `false` if `!user`. If route matches `guardFor`, evaluates `visible(user, entry)`. **Crucial Default**: If pathname is unknown/unlisted in `NAV`, it returns `true` (default-allow for authenticated users).
  - `Shell.tsx:100-104`: Intercepts `!canVisit(me, path)` and renders HTTP 403 screen (`403 · You don't have access to this page`).
  - Landing pages (`homeFor`): Platform Admin -> `/admin/disputes`, Campus Admin -> `/admin/verification`, Vendor -> `/vendor`, Student -> `/dashboard`.

---

### 1.2 Hash-Chained Audit Logging Subsystem (`web/src/chain/chain.ts`, `web/docs/chain-design.md`)
- **Role**: Tamper-evidence and reconciliation layer, NOT the system of record (PostgreSQL/ledger is authoritative). Non-PII by design: anchors only entry IDs, SHA-256 hashes, timestamps, and entry types (`docs/chain-design.md:4`).
- **Genesis Block**: `GENESIS_HASH = '0'.repeat(64)` (64 hexadecimal zeros) (`chain.ts:15`).
- **Cryptographic Hash Function**: SHA-256 implemented using Web Crypto API: `globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))` formatted to 64 lowercase hex characters (`chain.ts:17-21`).
- **Canonical Serialization (`canonical`)**:
  ```ts
  JSON.stringify({
    id: e.id, key: e.key, type: e.type, ts: e.ts,
    postings: e.postings.map(p => [p.account, p.side, p.amount]),
  })
  ```
  Guarantees deterministic hashing regardless of JavaScript object key insertion order (`chain.ts:24-29`).
- **Merkle Tree Construction (`merkleRoot`)**:
  - If empty: returns `GENESIS_HASH`.
  - While level length > 1: pairs adjacent hashes `sha256(level[i] + (level[i + 1] ?? level[i]))`. Odd trailing nodes duplicate the left node (`level[i]`). Top-level single hash is returned (`chain.ts:33-42`).
- **Block Header & Structure (`Block`)**:
  ```ts
  export interface Block {
    index: number;
    prevHash: string;
    merkleRoot: string;
    entryIds: string[];
    entryHashes: string[];
    ts: number;
    hash: string;
  }
  ```
  - Header format: `${b.index}|${b.prevHash}|${b.merkleRoot}|${b.ts}` (`chain.ts:44-45`).
  - Block hash: `sha256(headerOf(b))` (`chain.ts:52`).
  - Block chaining: `block[0].prevHash === GENESIS_HASH`; `block[n].prevHash === block[n-1].hash`.
- **Verification Engine (`verifyChain(chain, ledgerEntries)`)** (`chain.ts:60-79`):
  Evaluates 6 sequential integrity properties:
  1. `b.prevHash !== expectedPrev`: Broken previous block link.
  2. `merkleRoot(b.entryHashes) !== b.merkleRoot`: Merkle root mismatch with anchored hashes.
  3. `sha256(headerOf(b)) !== b.hash`: Block hash mismatch with header content.
  4. `!entry`: Anchored entry missing from live ledger.
  5. `hashEntry(entry) !== b.entryHashes[j]`: Anchored entry altered in live ledger after block generation.
  6. `pending > 0`: Detects ledger entries that exist in PostgreSQL/ledger but have not yet been anchored to any block.
- **Tamper Simulation (`tamperDemo`)** (`web/src/mock/db.ts:776-784`):
  Platform admin mutates `target.postings[0].amount += 1` on an anchored entry and writes an audit note. Running `verifyChain` reliably detects the alteration with `ok: false` and error `Block 0: entry JE-XXXXX was modified after anchoring`.
- **Production Target (Hyperledger Fabric)** (`docs/chain-design.md:14-24`):
  Channel `kart-audit`, Raft consensus orderer, 3 peer organizations (Kart Platform, Campus/Institution, PPI/Bank Partner). Private data collections for vendor settlement amounts; Celery worker for batched anchor submissions; daily reconciliation job.

---

### 1.3 Authentication & Session Security Subsystem (`web/src/server/auth.ts`, `web/src/server/http.ts`, `web/src/server/service.ts`, `web/src/app/api/session/route.ts`, `web/src/mock/StoreProvider.tsx`)
- **Dual Execution Modes**:
  - **Demo / Mock Mode** (default when `DATABASE_URL` is unset): Client-side state in `localStorage` (`kart-web-db-v4`), identity set by selecting user ID (`kart-web-session-v1`). Any user can switch roles via header `<select id="demo-user">` without passwords.
  - **Server / Production Mode** (enabled when `process.env.DATABASE_URL` is present): Backed by PostgreSQL (`accounts`, `sessions`, `campus_state`).
- **Password Security (`auth.ts:17-29`)**:
  - Hashing algorithm: Node.js `scrypt` with 16-byte random salt (`randomBytes(16).toString('hex')`) and 64-byte key length.
  - Storage format: `scrypt:${salt}:${hashHex}`. Plaintext passwords never stored.
  - Timing attack prevention: Verification uses `crypto.timingSafeEqual(actual, expected)`.
  - Password rules: 12 to 128 characters (`auth.ts:14`). Username rules: `/^[a-z][a-z0-9_.-]{2,31}$/` (3-32 lowercase alphanumeric/period/hyphen/underscore).
- **Brute Force Protection (`auth.ts:51-60`)**:
  - Account table tracks `failed_logins` integer and `locked_until` timestamp.
  - After 5 consecutive invalid login attempts (`failed_logins >= 4`), account is locked for 15 minutes (`now() + interval '15 minutes'`). Lock is evaluated before password verification.
- **Session Management (`auth.ts:61-87`, `schema.sql:19-27`)**:
  - Session token: Cryptographically secure 32 random bytes (`randomBytes(32).toString('base64url')`, 256 bits of entropy).
  - Database token storage: **Only token hash (`sha256(token)`) is saved in PostgreSQL** (`sessions.token_hash` primary key). Raw token is never stored.
  - Session lifetime: 7 days (`expires_at = now() + interval '7 days'`).
  - Cookie properties: `kart_session`, `httpOnly: true`, `secure: process.env.NODE_ENV === 'production'`, `sameSite: 'lax'`, `path: '/'`, `maxAge: 604800`.
- **CSRF & Origin Verification (`http.ts:10-15`)**:
  - `sameOrigin(req)`: Requires `application/json` Content-Type. If `origin` header is provided, verifies `new URL(origin).host === (req.headers.get('host') ?? new URL(req.url).host)`.
- **Payload Sanitization (`http.ts:25-32`)**:
  - Max payload length enforced at 200,000 bytes (200 KB). Non-object or array bodies rejected.
- **Data Segregation (`viewFor(db, user)`)** (`service.ts:43-61`):
  Filters state before transmitting snapshot to client:
  - Messages: Only threads matching `kart.canReadThread(user, threadKey)`.
  - Notifications & Wishlist: Scoped strictly to `user.id`.
  - Promo usage: Scoped to `user.id` unless `platform_admin`.
  - Orders: Scoped to buyer or vendor store unless staff (`campus_admin` or `platform_admin`).
  - Verifications & Tickets: Scoped to user unless staff.
  - Audit logs & Blockchain blocks: **Completely stripped (`[]`) unless `platform_admin`**.
  - Ledger entries: Non-admins receive ONLY entries containing postings to their own account (`account.endsWith(':' + user.id)`).

---

## 2. Logic Chain

1. **RBAC Decision Authority**:
   - `web/docs/rbac.md` explicitly designates `src/rbac/policy.ts` as the sole specification authority. Front-end `<Can>` and `Shell.tsx` navigation guards are UX-only optimizations.
   - Authoritative enforcement occurs in the backend business engine (`src/mock/db.ts` and `src/server/service.ts`). Every mutation checks `can(actor, permission, resource)`.
   - In `service.ts:23-38`, `runAction` guarantees that `actor` is always resolved from the authenticated server session (`g.user.id`), never from client input.
2. **Audit Layer Decoupling**:
   - `web/src/chain/chain.ts` and `web/docs/chain-design.md` establish that the hash chain is strictly an append-only cryptographic notary, not an execution engine.
   - Canonical JSON ensures that different JavaScript engine implementations or serialization differences cannot create spurious tamper alerts.
   - Merkle roots allow logarithmic proof of inclusion without storing entire blocks on-chain.
   - Separating private vendor amounts into off-chain ledger accounts while committing only entry hashes adheres strictly to data minimization and non-PII requirements.
3. **Defense-in-Depth for Sessions & Auth**:
   - Storing `sha256(token)` rather than raw tokens in the `sessions` table means that a database read compromise (e.g. SQL injection or database dump) does not grant active session impersonation.
   - Using `timingSafeEqual` for `scrypt` hash comparison stops side-channel timing attacks that could deduce password hashes byte-by-byte.
   - Account lockout with `FOR UPDATE` row locking prevents distributed race attacks on credential guessing.

---

## 3. Caveats & Vulnerability Analysis

### 3.1 Security Boundary Gaps & Vulnerabilities Identified
1. **Multi-Tenancy Isolation Gap (`campusId`)**:
   - While `campusId` is defined on `User` and `accounts`, the server API (`api/session/route.ts:8`, `api/action/route.ts:13`) hardcodes or defaults to `CAMPUS = 'main'`. There is no per-campus database row partitioning or cross-campus authorization boundary.
2. **Missing Server-Side Role Management (`user:roles`)**:
   - The permission `user:roles` exists in `platform_admin`, but `Kart` and `service.ts` expose no mutating action to alter user roles (`changeRole` or `assignRole` does not exist). Roles can only be provisioned at account creation or via database migration.
3. **Default-Allow on Unlisted Routes (`canVisit`)**:
   - `policy.ts:140` specifies: `return entry ? visible(user, entry) : true; // unknown routes need only a session`.
   - If a developer creates a new route in `src/app/(app)/...` without adding a corresponding entry to `NAV` in `policy.ts`, the route is accessible to any authenticated user regardless of role.
4. **Action Allow-List Gap (`withdrawListing`)**:
   - In `src/mock/db.ts`, `withdrawListing(actor, id)` exists and is valid. However, `withdrawListing` is missing from `ACTIONS` in `src/server/service.ts:7-14`. As a result, in server mode, sellers cannot withdraw listings via `/api/action`.
5. **Origin Header Absence Bypass**:
   - In `server/http.ts:13`, `if (!origin) return true;`. If an HTTP request is made without an `Origin` header (common with non-browser API clients, mobile apps, or certain curl invocations), `sameOrigin` accepts the request provided `Content-Type: application/json` is supplied.
6. **User Object Exposure in `viewFor`**:
   - In `service.ts:44-60`, `viewFor` scrubs orders, notifications, audit notes, and ledger entries, but does NOT filter `d.users`. In server mode, the client receives the entire campus user list (`id`, `name`, `roles`, `providerEnabled`, `storeId`, `campusId`). While passwords reside in `accounts`, user enumeration is possible.
7. **Single State Row Lock Contention (`campus_state`)**:
   - In server mode, all mutations acquire a PostgreSQL row lock on `campus_state WHERE campus_id = $1 FOR UPDATE`. While this guarantees strict ledger consistency, it serializes all concurrent campus actions into a single thread.

---

## 4. Conclusion

The KART repository possesses a robust, mathematically verifiable, and consistent security architecture:
1. **RBAC** is centrally defined in `src/rbac/policy.ts` and uniformly enforced across UI routing, navigation, and state operations in `src/mock/db.ts` and `src/server/service.ts`.
2. **Audit Logging** employs deterministic canonical serialization, SHA-256, Merkle root trees, and cryptographic hash chaining from a 64-zero genesis block. It reliably flags post-anchoring ledger tampering, broken links, and unanchored transactions.
3. **Authentication** in server mode implements best-in-class defense practices (`scrypt` with random salt, constant-time verification, token hashing in DB, 5-attempt/15-minute brute-force lockout, HTTP-only SameSite cookies).
4. Identified production gaps are clearly delineated: multi-tenancy partitioning, OAuth/OIDC enterprise integration, user list filtering in `viewFor`, adding `withdrawListing` to `ACTIONS`, and default-deny route guarding.

---

## 5. Verification Method

To independently verify the security mechanisms, run these commands from `c:\Users\Vishnu\Downloads\Kart\web`:

1. **Execute Vitest Automated Security Test Suite**:
   ```powershell
   cmd.exe /c "npm test"
   ```
   *Expected outcome*: 13 test files passed, 158 tests passed (100% pass rate). Specifically:
   - `src/rbac/policy.test.ts` (18 tests verifying role permissions, ownership scoping, navigation, route guards)
   - `src/chain/chain.test.ts` (5 tests verifying genesis block, clean chain verification, post-anchor tampering detection, broken links, pending unanchored entry flagging)
   - `src/server/auth.test.ts` (6 tests verifying username/password validation, scrypt salting, token hashing in DB, 5-failure lockout, weak registration rejection)
   - `src/server/service.test.ts` (9 tests verifying allow-list enforcement, actor binding, RBAC fee enforcement, viewFor snapshot scrubbing)

2. **Static Analysis & Typecheck**:
   ```powershell
   cmd.exe /c "npx tsc --noEmit"
   ```
   *Expected outcome*: Zero errors, clean TypeScript build.

3. **Production Build Compilation**:
   ```powershell
   cmd.exe /c "npm run build"
   ```
   *Expected outcome*: Successful Next.js build across all 41 routes and dynamic API endpoints (`/api/action`, `/api/session`).

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | RBAC | Role Definition | 4 platform roles (`student`, `vendor`, `campus_admin`, `platform_admin`) | Role enum | Role type | Type error on invalid role | `policy.ts:4` |
| 2 | RBAC | Vendor Store Types | 4 store specialization types (`canteen`, `xerox`, `stationery`, `merch`) | StoreType enum | StoreType | Type error on invalid store | `policy.ts:5` |
| 3 | RBAC | Provider Capability | Student capability `providerEnabled` unlocking Provider Hub & bidding | User object | `provider:hub` permission | Omitted if student unverified | `policy.ts:36,47` |
| 4 | RBAC | Permission Set | 28 fine-grained `resource:action` permission strings | Permission enum | Permission type | Compile-time check | `policy.ts:7-14` |
| 5 | RBAC | Role-Permission Matrix | Mapping of roles to permission lists (`ROLE_PERMISSIONS`) | Role | Array of `Permission` | Fallback empty set | `policy.ts:22-30` |
| 6 | RBAC | Resource Ownership Scoping | Scoping checks in `can()` for tasks, threads, stores, orders, wallets | User, Permission, Resource | `boolean` | Returns `false` on mismatch | `policy.ts:52-70` |
| 7 | RBAC | Dynamic Navigation Filtering | `navFor(user)` filters sidebar entries by permission, role & store type | User | `NavItem[]` | Excludes unauthorized items | `policy.ts:122-129` |
| 8 | RBAC | Route Guarding | `canVisit(user, pathname)` guards routes using longest prefix matching | User, pathname | `boolean` | Default-allow on unlisted routes | `policy.ts:132-141` |
| 9 | RBAC | UI Route Interception | `Shell.tsx` renders 403 screen on `canVisit === false` | User, current path | 403 Error Component | User redirected to role home | `Shell.tsx:100-104` |
| 10 | RBAC | Task State Machine Guarding | Every task transition specifies required `Permission` and `Actor` role | TaskStatus, TaskEvent | `Transition` | Transition rejected if unauthorized | `taskMachine.ts:20-48` |
| 11 | RBAC | Chat Thread Access Control | `canReadThread` restricts threads to poster and bidder; admin during dispute | Actor, threadKey | `boolean` | Returns `false`; logs audit note | `db.ts:580-586` |
| 12 | RBAC | Chat Authoring Restriction | Admins barred from authoring messages; only poster and bidder may send | Actor, threadKey, body | `Result` | Returns `{ ok: false, error: '...' }` | `db.ts:608-614` |
| 13 | Audit | SHA-256 Hashing | Cryptographic hash of strings using Web Crypto `SHA-256` digest | Text string | 64-char hex string | Promise rejection on crypto error | `chain.ts:17-21` |
| 14 | Audit | Deterministic Canonical JSON | Strict deterministic JSON serialization with fixed key ordering | JournalEntry | Canonical JSON string | Throws on circular ref | `chain.ts:24-29` |
| 15 | Audit | Merkle Root Generation | Pairwise hashing of entry hashes to produce block Merkle root | `string[]` of hashes | 64-char root hash | Returns `GENESIS_HASH` if empty | `chain.ts:33-42` |
| 16 | Audit | Block Header Chaining | Header format `${index}\|${prevHash}\|${merkleRoot}\|${ts}` chained to prev | Block header fields | Block hash | Link broken if prevHash mismatch | `chain.ts:44-56` |
| 17 | Audit | Genesis Block Definition | 64 hexadecimal zeros as the origin previous hash | Constant | `'0'.repeat(64)` | None | `chain.ts:15` |
| 18 | Audit | Verification Engine | `verifyChain` validates links, roots, block hashes, and ledger entries | Chain, LedgerEntries | `VerifyResult` | Aggregates all anomalies in `problems` | `chain.ts:60-79` |
| 19 | Audit | Tamper Simulation | `tamperDemo` alters anchored entry amount by +1 for verification demo | Actor (admin) | `Result` | Requires `chain:audit`; demo only | `db.ts:776-784` |
| 20 | Audit | Hyperledger Fabric Architecture | Multi-org permissioned audit architecture specification (`kart-audit`) | Spec document | Architecture spec | Documented in `chain-design.md` | `chain-design.md` |
| 21 | Auth | Demo Mode Authentication | Instant client-side role switcher without credentials | User ID | Switched session | None (demo only) | `StoreProvider.tsx:137` |
| 22 | Auth | Password Hashing (`scrypt`) | Random 16-byte salt, 64-byte scrypt key derivation | Password string | `scrypt:${salt}:${hash}` | Rejects < 12 or > 128 chars | `auth.ts:17-29` |
| 23 | Auth | Timing-Safe Comparison | `crypto.timingSafeEqual` prevents side-channel timing attacks | Actual & expected | `boolean` | Returns `false` on length mismatch | `auth.ts:28` |
| 24 | Auth | Brute-Force Lockout | 15-minute account lockout after 5 consecutive failed login attempts | Username, password | Lockout state in DB | Returns `null` on locked accounts | `auth.ts:51-60` |
| 25 | Auth | Session Token Generation | 32 cryptographically random bytes formatted as base64url | None | 256-bit token string | None | `auth.ts:61` |
| 26 | Auth | Database Token Hashing | Only `sha256(token)` stored in DB sessions table | Token string | SHA-256 token hash | Database error on collision | `auth.ts:15,62` |
| 27 | Auth | Secure Session Cookie | HTTP-only, SameSite=Lax, secure in production, 7-day TTL cookie | Token string | Set-Cookie header | Browser cookie enforcement | `auth.ts:67-69` |
| 28 | Auth | CSRF Origin Validation | Requires JSON content-type and matches origin host against host header | Request object | `boolean` | Rejects cross-origin POST | `http.ts:10-15` |
| 29 | Auth | Payload Size Protection | Limits request body parsing to 200,000 bytes | Request object | Parsed JSON object | Returns `{}` on excess length | `http.ts:25-32` |
| 30 | Auth | Server Action Gateway | Executes allow-listed actions using session user identity as actor | Action name, args | `Result`, filtered DB | 401 on expired session; 400 on bad | `service.ts:23-38` |
| 31 | Auth | Snapshot Data Segregation | `viewFor` strips confidential data before sending state to browser | Full Db, User | Scoped Db snapshot | Redacts non-owned ledger entries | `service.ts:43-61` |
| 32 | Security | Attachment Sanitization | `cleanAttachments` enforces extensions, size (10MB), and strips paths | FileLike array | Sanitized attachments | Error on invalid extension or size | `attachments.ts:22-36` |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | RBAC `can()` | `user === null` | Immediately returns `false` for any permission check. |
| 2 | RBAC `can()` | Unknown/undefined resource | When `resource === undefined`, returns `true` if role possesses the permission. |
| 3 | RBAC `canVisit` | Path not in `NAV` list | Returns `true` by default if user is authenticated (`policy.ts:140`). |
| 4 | RBAC Scoping | Vendor accessing order from another store | Fails with `'This order belongs to another store.'` (`db.ts:233`). |
| 5 | RBAC Task Bid | Poster placing a bid on their own task | Fails with `'You cannot bid on your own task.'` (`db.ts:403`). |
| 6 | RBAC Task Dispute | Campus admin attempting to resolve task dispute | Fails with `'Not allowed.'` (only `platform_admin` has `dispute:resolve`). |
| 7 | Audit `merkleRoot` | Empty hash array `[]` | Returns `GENESIS_HASH` (64 zeros) without throwing (`chain.ts:34`). |
| 8 | Audit `merkleRoot` | Odd number of hashes (e.g. 3 hashes) | Duplicates last hash `sha256(hashes[2] + hashes[2])` to balance tree. |
| 9 | Audit `verifyChain` | Ledger entry modified after block generation | Reports `Block X: entry JE-XXXXX was modified after anchoring` (`chain.test.ts:26-32`). |
| 10 | Audit `verifyChain` | Rewritten block Merkle root | Reports `Block X: Merkle root does not match its entry hashes` (`chain.test.ts:33-39`). |
| 11 | Audit `verifyChain` | New ledger entry added but un-anchored | Reports `X ledger entry is not yet anchored` with `ok: false` (`chain.test.ts:40-46`). |
| 12 | Auth Username | Username with leading digit (`1abc`) | Regex `/^[a-z][a-z0-9_.-]{2,31}$/` rejects with `false` (`auth.test.ts:41`). |
| 13 | Auth Username | Uppercase username (`Alex`) | Normalized with `.toLowerCase().trim()` to match case-insensitively (`auth.ts:48`). |
| 14 | Auth Password | 11-character password | Rejects with `false` (minimum length is 12 characters) (`auth.test.ts:42`). |
| 15 | Auth Lockout | 5 consecutive wrong passwords | Sets `locked_until` to `now() + 15 min`; 6th attempt with correct password returns `null` (`auth.test.ts:70-74`). |
| 16 | Auth Lockout | Successful login after failures | Resets `failed_logins` to `0` and clears `locked_until` (`auth.ts:60`). |
| 17 | Server Action | Action name `tamperDemo` in server mode | Rejects with `{ ok: false, error: 'Unknown action.' }` (not in `ACTIONS`) (`service.test.ts:21-28`). |
| 18 | Server Action | Prototype pollution payload (`__proto__`) | Rejects with `{ ok: false, error: 'Unknown action.' }` (`service.test.ts:23`). |
| 19 | Server Action | Action arguments array > 8 elements | Rejects with `{ ok: false, error: 'Invalid request.' }` (`service.ts:25`). |
| 20 | File Upload | File with path traversal name (`../../passwd.pdf`) | `safeName` strips path separators, preserving only `passwd.pdf` (`attachments.ts:19`). |
| 21 | File Upload | File with control characters (`\u0000report.pdf`) | Control characters removed via regex `[\u0000-\u001f\u007f]` (`attachments.ts:19`). |
| 22 | File Upload | File size exceeding 10 MB (10,485,761 bytes) | Rejects with `... is larger than 10 MB` (`attachments.ts:32`). |
| 23 | Chat Rate Limit | User sending 8 messages within 10 seconds | Rejects with `'Slow down a little: too many messages in a few seconds.'` (`db.ts:601,623`). |
| 24 | Marketplace Escrow | Cancelling rental after reservation | Restores listing to active, refunds escrow to buyer, bumps escrow cycle (`db.ts:985`). |
