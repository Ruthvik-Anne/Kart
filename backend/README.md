# KART connected development stack

The repository contains a Next.js prototype at `/login` and a connected workspace at `/live`. The connected workspace uses this FastAPI service through a same-origin Next.js route. It persists campus data in SQLite and supports the workflows below with **simulated KC only**.

## Run both apps

```bash
export KART_SESSION_SECRET="replace-this-with-at-least-32-random-characters"
docker compose up --build
```

Open <http://localhost:3000/live>. A demo student may create a test identity and receive test KC. Open a private window to create another student in the same campus and exercise bidding, purchases, handover, services, and events. `GET /health` and `/docs` are on port 8000. A named Docker volume keeps development data across restarts. Do not deploy this compose configuration: `KART_DEMO_MODE=1` permits anyone to create test students and test shops.

For backend-only development:

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt httpx
export KART_DB_PATH=./kart.db KART_DEMO_MODE=1
export KART_SESSION_SECRET="replace-this-with-at-least-32-random-characters"
uvicorn app.main:app --reload
python -m unittest discover -s tests -v
```

## Implemented workflows

| Area | Backend behavior |
|---|---|
| Identity | Short-lived signed **demo** sessions; all operations scoped to a verified test student and campus. Production identity is intentionally disabled. |
| Tasks | Anonymous posting, fixed or competitive bids, private proposal conversations, funded assignment, work/review/dispute states. Deadline feasibility and explainable bid ranking. |
| Linked pickup | Task creator links their own order; work waits for readiness. Only the assigned student can obtain a pickup credential. |
| Shops | Campus vendor organizations, catalogs, stock, idempotent single-store checkout, vendor preparation queue, credential-based collection, pre-preparation refunds. Canteen, stationery and merchandise use this product flow. |
| Xerox | Private PDF queue with page/copy/colour/duplex/binding pricing, scoped document download, preparation states, pickup credentials and early cancellation refunds. Development files are stored on the backend volume. |
| Student market | Sales with reserved KC and buyer-confirmed handover; rentals with duration limits, fee, deposit, return confirmation, cancellation and dispute resolution. |
| Services | Student offerings, funded booking, provider submission, buyer approval, cancellation and administrator dispute resolution. |
| Events | Club events, capped registration, paid/free tickets and one-time organizer check-in. |
| KC ledger | Paired append-only postings, derived balances, idempotency keys, atomic reserves/releases/refunds. Test grants have no monetary backing. |

## Data and authorization boundaries

- SQLite `BEGIN IMMEDIATE` serializes contested stock, capacity, bid acceptance, and reservations. A failed operation rolls back the ledger and workflow together.
- Listing, task, service and event data are scoped by campus. Sensitive task messages are limited to poster and participant; anonymous poster IDs are omitted from other students' projections.
- Order and ticket pickup codes are derived from the server secret and only their hashes are stored. Replace this demo design with rotating, limited-use credentials and operational rate limits before launch.
- The frontend prototype remains at `/login` for visual comparison. `/live` is connected to the persistent backend; it does not silently write to the browser mock.

## Production gates

This is an end-to-end **development demo**, not a live payments product. Before a real launch: implement verified college login and session management, scoped staff onboarding and approval, PostgreSQL with migrations, private file storage for Xerox and attachments, moderation and dispute evidence, rate limiting, observability, reconciliation, and the reviewed payment custody/settlement integration. Actual KC top-ups, vendor payouts, e₹ transfers, and a blockchain network are not connected. The current audit log is a database table; it is not a blockchain.

Run `PYTHONPATH=backend python -m unittest discover -s backend/tests -v` from the repository root. CI installs FastAPI and HTTPX and runs an HTTP integration test in addition to the service tests. The web workflow runs type checking, unit tests and the Next.js build.
