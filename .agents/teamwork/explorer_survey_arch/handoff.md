# Repository Architecture & Codebase Scan Report

**Target Repository**: `c:\Users\Vishnu\Downloads\Kart`  
**Date & Timestamp**: 2026-10-10T05:12:00Z  
**Explorer Archetype**: `teamwork_preview_explorer` (Repository Architecture Explorer)  
**Report Destination**: `c:\Users\Vishnu\Downloads\Kart\.agents\teamwork\explorer_survey_arch\handoff.md`

---

## 1. Observation

### 1.1 Root Directory & Repository Organization
- **Project Root**: `c:\Users\Vishnu\Downloads\Kart`
- Root directory files:
  - `package.json` (lines 5–13): delegates execution to `web/` via `npm --prefix web <command>` (`dev`, `build`, `start`, `lint`, `test`, `test:e2e`, `install:web`).
  - `README.md` (lines 3–17): documents KART as a campus commerce platform with demo in-browser backend, simulated KC wallet, and release boundary notes regarding deferred FastAPI/PostgreSQL/PPI integration.
  - `LICENSE`: Apache 2.0 license.
  - `.github/workflows/web.yml` (lines 20–33): GitHub Actions CI workflow using Node 24 on `ubuntu-latest`, executing `npm ci`, `npm run lint`, `npm test`, `npm run build`, and browser E2E via Puppeteer on port 3100.
  - `.agents/teamwork/`: multi-agent teamwork workspace.
  - `web/`: primary application codebase.

### 1.2 Module Structure & Directory Layout in `web/`
Direct inspection of `c:\Users\Vishnu\Downloads\Kart\web` reveals 7 subdirectories and 12 files:
- `db/schema.sql`: PostgreSQL DDL defining `campus_state`, `accounts`, `sessions`.
- `scripts/db.ts`: CLI utility for initializing PostgreSQL schema and provisioning accounts with scrypt password hashing.
- `docs/`: 4 design specifications (`chain-design.md`, `ledger.md`, `rbac.md`, `task-comms.md`).
- `e2e/`: 3 Puppeteer browser automation scripts (`e2e.mjs`, `features.mjs`, `retail.mjs`).
- `src/`: Core application source divided into 10 distinct modules:
  1. `src/app/`: Next.js 16 App Router pages, layouts, error/not-found handlers, and API route handlers.
  2. `src/chain/`: Permissioned blockchain audit layer (`chain.ts`, `chain.test.ts`).
  3. `src/components/`: Shared UI components (`Shell.tsx`, `CartProvider.tsx`, `CartModal.tsx`, `Catalog.tsx`, `ChatThread.tsx`, `FilePicker.tsx`, `StarRating.tsx`, `TaskCard.tsx`, `VendorOrders.tsx`, `ui/index.tsx`).
  4. `src/domain/`: Domain state machine (`taskMachine.ts`, `taskMachine.test.ts`).
  5. `src/integrations/`: Payment partner interface (`ppi.ts` defining `PpiAdapter` and `MockPpiAdapter`).
  6. `src/ledger/`: Financial double-entry journal and posting rules (`ledger.ts`, `rules.ts`, `ledger.test.ts`).
  7. `src/lib/`: Domain utilities (`attachments.ts`, `promo.ts`, `scoring.ts`, `theme.ts`, with respective tests).
  8. `src/mock/`: In-browser mock database engine (`db.ts`, `StoreProvider.tsx`, `db.test.ts`, `features.test.ts`, `retail.test.ts`).
  9. `src/rbac/`: Role-based access control policies, route guards, navigation manifest (`policy.ts`, `policy.test.ts`).
  10. `src/server/`: Server-mode PostgreSQL integration, authentication, session tokens, action allow-list, per-user data views (`database.ts`, `pgStore.ts`, `auth.ts`, `service.ts`, `http.ts`, `auth.test.ts`, `service.test.ts`).

### 1.3 Data Architecture (Mock vs. Server API / Postgres Store)
- **Mock Architecture (`web/src/mock/db.ts`, `web/src/mock/StoreProvider.tsx`)**:
  - The `Db` interface encompasses 24 collections: `promos`, `promoUses`, `wishlist`, `reviews`, `workflows`, `listings`, `events`, `tickets`, `vendorApps`, `users`, `stores`, `products`, `orders`, `tasks`, `messages`, `profiles`, `services`, `notifications`, `audit`, `verifications`, `entries`, `chain`, `fees`, `priorityWeights`, `matchWeights`, `seq`.
  - The `Kart` class encapsulates 40+ mutating domain operations, strictly posting balance transfers through `Ledger` and verifying RBAC permissions and ownership.
  - Client state in demo mode is synchronized to `localStorage['kart-web-db-v4']` and listens to window `storage` events for multi-tab reactivity.
- **Server Architecture (`web/src/server/`, `web/db/schema.sql`)**:
  - SQL schema in `db/schema.sql` defines 3 tables:
    - `campus_state` (`campus_id text PRIMARY KEY, data jsonb NOT NULL, version bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()`)
    - `accounts` (`id text PRIMARY KEY, campus_id text NOT NULL REFERENCES campus_state(campus_id), username text NOT NULL, password_hash text NOT NULL, failed_logins integer DEFAULT 0, locked_until timestamptz, created_at timestamptz DEFAULT now(), UNIQUE (campus_id, username)`)
    - `sessions` (`token_hash text PRIMARY KEY, account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT now()`)
  - Server transactions in `pgStore.ts` execute with pessimistic row locks: `SELECT data FROM campus_state WHERE campus_id = $1 FOR UPDATE`.
  - Authentication in `auth.ts` implements scrypt password hashing (64-byte key with 16-byte random salt), timingSafeEqual verification, 5-failure account lockout (15-minute lock), 7-day session token (32 random bytes stored hashed with SHA-256), and `httpOnly`, `sameSite: lax` cookies.
  - API execution: `POST /api/action` invokes `runAction(pgStore, campus, user.id, method, args)` against an allow-list of 44 operations (`ACTIONS` in `service.ts`). The actor identity is strictly derived from the verified session user.
  - Per-user view filtering: `viewFor(db, user)` in `service.ts` filters out messages, orders, audit notes, blockchain blocks, and non-owned ledger entries before returning the database snapshot to the client.

### 1.4 Route Structure & UI Boundaries
- Next.js 16 App Router configuration:
  - 41 total routes generated during production build: 37 static routes and 4 dynamic routes (`/api/action`, `/api/session`, `/product/[id]`, `/tasks/[id]`).
  - Layout hierarchy:
    - `web/src/app/layout.tsx`: Root Server Component loading fonts (DM Sans, Outfit) and `<StoreProvider>`.
    - `web/src/app/(app)/layout.tsx`: Server Component wrapping all application pages in `<CartProvider><Shell>{children}<CartModal /></Shell></CartProvider>`.
  - Client vs. Server Components:
    - Root layouts are Server Components.
    - All sub-pages and UI components (`Shell.tsx`, `CartModal.tsx`, `Catalog.tsx`, `ChatThread.tsx`, `TaskCard.tsx`, `VendorOrders.tsx`, etc.) are Client Components using `'use client'` because they subscribe to reactive state via `useKart()` and `useCart()`.
    - Next.js Server Actions (`'use server'`) are NOT used; all client-server communication uses Next.js Route Handlers (`app/api/action/route.ts` and `app/api/session/route.ts`).
  - Navigation & Access Control:
    - `Shell.tsx` acts as a client-side route guard: computes `canVisit(me, path)` using longest-prefix match against `NAV` in `src/rbac/policy.ts`. If unauthorized, renders a 403 Forbidden screen (`Empty` component with home redirect).

### 1.5 Build Configuration & Test Suite Execution
- **Dependency versions**: Next.js 16.4.0, React 19.0.0, TypeScript 5.9.0, Vitest 5.0.3, Tailwind CSS 4.3.3 (`@tailwindcss/postcss`), pg 8.23.1, bcryptjs 3.0.3.
- **Verification execution results**:
  1. `cmd.exe /c "npm run lint"` (`tsc --noEmit`): Exited with code 0, 0 errors.
  2. `cmd.exe /c "npm test"` (`vitest run`): Exited with code 0.
     - 13 test files passed (100% of test files).
     - 158 tests passed (100% of tests).
     - Test run duration: 1.24s.
  3. `cmd.exe /c "npm run build"` (`next build`): Exited with code 0.
     - Compiled successfully in 1766ms with Turbopack.
     - Generated 41 static/dynamic routes in 2.9s.

---

## 2. Logic Chain

1. **Root Script Delegation**:
   - *Observation*: Root `package.json` contains `"scripts": { "dev": "npm --prefix web run dev", ... }`.
   - *Inference*: The repository is structured as a single-package project where all application code, tooling, and build configurations reside exclusively inside the `web/` directory.

2. **Dual-Mode Backend Architecture (Demo vs. Server)**:
   - *Observation*: `StoreProvider.tsx` queries `GET /api/session`. If `server` is false, it uses local `Kart(seed())` with `localStorage` persistence. If `server` is true, it proxies mutations via `POST /api/action`.
   - *Inference*: The application is decoupled from backend infrastructure. In default development mode without a PostgreSQL instance (`DATABASE_URL` unset), it runs 100% in-browser with complete fidelity. When connected to PostgreSQL, the exact same domain business rules execute on the server under row locks.

3. **Data Storage & Concurrency Model**:
   - *Observation*: `db/schema.sql` stores all domain state inside a single `data jsonb` column in `campus_state`, and `pgStore.ts` accesses it with `SELECT data FROM campus_state WHERE campus_id = $1 FOR UPDATE`.
   - *Inference*: Rather than standard normalized relational tables per entity (orders, tasks, products), KART implements an Event-Sourced / State-Document model within PostgreSQL. Pessimistic row locking ensures serializable execution of actions within a campus, preventing race conditions and double-spending across wallet and escrow balances.

4. **Security & Authorization Model**:
   - *Observation*: `policy.ts` defines 4 roles and 22 permissions. `Shell.tsx` guards routes via `canVisit()`. `db.ts` re-evaluates `can(actor, ...)` inside every mutation method. `service.ts` derives `actorId` exclusively from the session token.
   - *Inference*: KART implements defense-in-depth:
     1. Presentation layer hides unauthorized navigation items (`navFor()`).
     2. Layout layer blocks unauthorized route access with a 403 screen (`canVisit()`).
     3. Domain layer validates permissions and ownership invariants (`can(actor, perm, resource)`).
     4. Transport layer derives actor identity strictly from verified server-side session cookies, preventing impersonation.

5. **Financial Accounting Integrity**:
   - *Observation*: `ledger.ts` checks `sum(debits) === sum(credits)` for every `JournalEntry` and enforces non-negative constraints on `USER_WALLET`, `TASK_ESCROW`, and `VENDOR_PAYABLE`.
   - *Inference*: All money transfers are mathematically zero-sum and double-entry balanced. Direct balance alteration is impossible; balances are dynamically computed from postings.

---

## 3. Caveats

1. **PostgreSQL Execution Environment**:
   - The server mode implementation (`src/server/auth.ts`, `src/server/database.ts`, `src/server/pgStore.ts`, `src/server/service.ts`) is fully covered by unit tests with mocked pg pools (`auth.test.ts`, `service.test.ts`), but has not been tested against a live, running PostgreSQL instance in this audit session.
2. **Single Campus Multi-Tenancy**:
   - Although `campus_id` exists in `campus_state`, `accounts`, and `User`, the current seed and scripts hardcode `campusId = 'main'`. Multi-campus tenancy routing is not yet active.
3. **Puppeteer E2E Environment**:
   - Running `npm run test:e2e` requires an installed Google Chrome binary (`CHROME_PATH`) and a running web server on port 3100.
4. **Deferred Integrations**:
   - External PPI partner (`src/integrations/ppi.ts`), binary file storage (attachments currently validate file metadata only), and real-time WebSockets (currently using `storage` events) are mocked/deferred as documented in `README.md`.

---

## 4. Conclusion

1. **Repository Architecture Assessment**:
   - The KART codebase is cleanly architected, modular, and type-safe across Next.js 16, React 19, and TypeScript 5.9.
   - Domain logic (double-entry ledger, blockchain audit chain, task lifecycle state machine, RBAC policies, and scoring algorithms) is completely decoupled from UI rendering and framework dependencies, allowing 100% testability in Node/Vitest.
2. **Quality & Compilation Status**:
   - **Type Checking**: Clean (`tsc --noEmit` exited code 0).
   - **Unit & Integration Tests**: 100% passing (13/13 test files, 158/158 tests passing in 1.24s).
   - **Production Build**: Clean (41 routes generated with Next.js Turbopack in 2.9s).
3. **Data Architecture Maturity**:
   - The dual-mode architecture (In-browser mock vs. PostgreSQL state document with scrypt auth and per-user view sanitization) is fully implemented and verified by automated test suites.

---

## 5. Verification Method

To independently reproduce and verify the findings of this scan:

1. **Static Typecheck**:
   ```cmd
   cd c:\Users\Vishnu\Downloads\Kart\web
   cmd.exe /c "npm run lint"
   ```
   *Expected Output*: Exit code 0, no diagnostics emitted.

2. **Automated Test Suite**:
   ```cmd
   cd c:\Users\Vishnu\Downloads\Kart\web
   cmd.exe /c "npm test"
   ```
   *Expected Output*: 13 test files passed, 158 tests passed.

3. **Production Build Compilation**:
   ```cmd
   cd c:\Users\Vishnu\Downloads\Kart\web
   cmd.exe /c "npm run build"
   ```
   *Expected Output*: Next.js 16.4.0 (Turbopack) compiles successfully, generating 41 routes.

4. **Code Inspection Checkpoints**:
   - RBAC & Route Guards: inspect `c:\Users\Vishnu\Downloads\Kart\web\src\rbac\policy.ts` lines 7–40 and 122–148.
   - Ledger Posting Invariants: inspect `c:\Users\Vishnu\Downloads\Kart\web\src\ledger\ledger.ts` lines 64–91.
   - Audit Chain Merkle & Hash Verification: inspect `c:\Users\Vishnu\Downloads\Kart\web\src\chain\chain.ts` lines 47–80.
   - Dual-Mode State Provider: inspect `c:\Users\Vishnu\Downloads\Kart\web\src\mock\StoreProvider.tsx` lines 58–135.
   - Postgres Schema & Locking: inspect `c:\Users\Vishnu\Downloads\Kart\web\db\schema.sql` and `c:\Users\Vishnu\Downloads\Kart\web\src\server\database.ts` lines 27–35.
