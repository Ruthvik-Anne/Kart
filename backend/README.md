# KART backend: first implementation slice

This service replaces the browser mock for **tasks, bids, private conversations, and simulated KC reservations**. It is a FastAPI modular monolith with SQLite transactions for local development. The existing `web/` app still uses `localStorage`; it has **not** been wired to these endpoints yet.

## Run

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export KART_DB_PATH=./kart.db
export KART_SESSION_SECRET="replace-with-at-least-32-random-characters"
export KART_DEMO_MODE=1
uvicorn app.main:app --reload
python -m unittest discover -s tests -v
```

Open `/docs` for the API contract. In demo mode, `POST /dev/users` creates a verified **test** student and returns a signed short-lived bearer token. `POST /dev/kc-grants` issues *simulated* KC to that student with an idempotency key. Those development routes are absent unless `KART_DEMO_MODE=1`. Never deploy with that flag enabled.

## Workflow and data guarantees

- Every read and write checks the authenticated actor's campus; anonymous task projections hide the poster ID from other students.
- One bid per worker per task. Before assignment each bidder has a separate private thread with the poster; after assignment only the two participants can use the execution thread.
- Accepting a bid reserves the agreed KC atomically with assignment. Approval releases it once; cancellation before work refunds it; disputed funds require an administrator decision. Failed operations roll back.
- The journal is append-only, balanced with paired postings, uses unique idempotency keys, and computes balances from postings. KC here has **no monetary value**. It is not an actual wallet, escrow service, payment rail, blockchain, or guarantee of payment.
- Startup creates the development schema. SQLite is suitable for local use; migrate to PostgreSQL with managed migrations and transaction locking before multi-instance deployment.

## Migration map

| Existing prototype | Backend boundary |
|---|---|
| `web/src/mock/db.ts` task methods | `/v1/tasks`, bids, actions, messages |
| `web/src/ledger/` | `app/ledger.py` and `journal`/`postings` in the database |
| `web/src/rbac/policy.ts` | Server authorization in `app/service.py` |
| `web/src/chain/` | Audit anchoring later; current audit events are database records |
| `web/src/integrations/ppi.ts` | Partner integration later; no production top-ups or payouts |

## Next implementation slices

1. Replace development identities with verified college login, memberships, scoped staff permissions, and campus onboarding. Add migrations and PostgreSQL.
2. Add vendor catalogs and separate order workflows for canteen, Xerox, stationery, events, merchandise, student listings and services. Link pickup tasks only after authorizing the originating order.
3. Add uploads in private storage, pickup tokens, notifications, reviews, moderation, and refunds.
4. Integrate an approved payment/custody arrangement after its contractual and regulatory terms are known. Reconcile every provider event to ledger entries. Do not translate simulated KC grants into real funds.
5. Replace `web/src/mock/StoreProvider.tsx` with a typed API client incrementally; retain mock mode for UI testing until each endpoint is complete.

**Current boundaries:** no production identity, merchant settlement, bank custody, payment guarantee, network blockchain, file upload, or frontend integration. The API is a working backend foundation, not a deployable payment product.
