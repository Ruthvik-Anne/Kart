# KART web

Role-based campus commerce front-end: Next.js 16, TypeScript, Tailwind 4. It runs against an in-browser mock backend (`src/mock`) that mirrors what the FastAPI services will enforce. KC is simulated; no real money moves.

## Run
```
npm install
npm run dev          # http://localhost:3000, then pick a demo user at /login
npm run lint         # tsc --noEmit
npm test             # 90 unit/integration tests (Vitest)
npm run build && npm start -- -p 3100
npm run test:e2e     # real-browser walkthrough of every role (needs Chrome; set CHROME_PATH, BASE_URL)
```

## What's here
| Area | Where |
|---|---|
| Roles, permissions, nav, route guards | `src/rbac/policy.ts` ([docs](docs/rbac.md)) |
| Double-entry ledger and posting rules | `src/ledger/` ([docs](docs/ledger.md)) |
| Hash-chained audit layer | `src/chain/` ([docs](docs/chain-design.md)) |
| Task board scoring, lifecycle, private chat | `src/lib/scoring.ts`, `src/domain/`, `src/components/ChatThread.tsx` ([docs](docs/task-comms.md)) |
| Mock backend with permission checks | `src/mock/db.ts` |
| PPI boundary (existing partner, deferred) | `src/integrations/ppi.ts` |

Modules: food, Xerox/print, supplies, services, task board (urgent / short-term / long-term), buy-sell-rent with escrow, events with approval and tickets, wallet, orders, vendor consoles by store type, provider hub, campus admin (verification, vendors, events, reports), platform admin (disputes, ledger, audit chain, fraud, users, fees).

## Also included
- Promo codes (platform-funded, ledger-backed), wishlist, product pages with verified-buyer reviews, global cart.
- Light / dark / system theme in Settings (CSS variables in `src/app/globals.css`; generated tokens in `src/app/tokens.generated.css`).
- 158 unit tests (`npm test`) and three browser suites (`npm run test:e2e`).
- **Server mode** (set `DATABASE_URL`, see `.env.example`): username/password sign-in (scrypt, 7-day sessions, lockout after 5 failures), `/api/session` and `/api/action`. Every action runs on the server as the session user under a row lock, re-checks RBAC, and returns only that user's slice of the data. Setup: `npm run db:init`, then `KART_PASSWORD=... npm run db:account -- <username> <userId>`. Without `DATABASE_URL` the app stays in demo mode.
- Tested with mocked Postgres (action allow-list, RBAC, serialisation, data filtering, auth, lockout). **Not yet run against a live Postgres.**

## Before production
Replace `src/mock` with the FastAPI + PostgreSQL services, add real authentication, connect the PPI partner behind `PpiAdapter`, add file storage for print jobs and task attachments, and tenant data by campus. Demo data persists in `localStorage` and is shared between tabs.
