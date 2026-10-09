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
| Audit | Hash-linked event records with administrator verification. This detects changes to retained events; it is not an externally anchored blockchain. |

## Data and authorization boundaries

- SQLite `BEGIN IMMEDIATE` serializes contested stock, capacity, bid acceptance, and reservations. A failed operation rolls back the ledger and workflow together.
- Listing, task, service and event data are scoped by campus. Sensitive task messages are limited to poster and participant; anonymous poster IDs are omitted from other students' projections.
- Order and ticket pickup codes are derived from the server secret and only their hashes are stored. Replace this demo design with rotating, limited-use credentials and operational rate limits before launch.
- The frontend prototype remains at `/login` for visual comparison. `/live` is connected to the persistent backend; it does not silently write to the browser mock.

## Production gates

This is an end-to-end **development demo**, not a live payments product. Campus OIDC login and approved shop/club onboarding are available in the separate identity deployment described below. A real launch still needs durable production data architecture and migrations, private file storage and retention, moderation and dispute evidence, rate limiting, observability, reconciliation, and a reviewed payment custody/settlement integration. Actual KC top-ups, vendor payouts, e₹ transfers, and a blockchain network are not connected. The current audit log is a database table; it is not a blockchain.

## Campus identity deployment (KC disabled)

`compose.production.yaml` runs a single backend instance behind a TLS reverse proxy and keeps the database and uploads on one persistent volume. Configure the variables shown in `.env.production.example` through your deployment secret store, then run `docker compose -f compose.production.yaml up --build -d`. Forward HTTPS traffic to the web container on loopback port 3000. Register the exact public `KART_OIDC_REDIRECT_URI` with your OpenID Connect provider. The provider must issue RS256 ID tokens with `sub`, `email`, `email_verified=true`, `nonce`, and the configured issuer and client audience. A domain in `KART_CAMPUS_DOMAINS` maps a verified institutional email to exactly one campus. Only named `KART_BOOTSTRAP_ADMINS` get campus admin rights on first login; configure this list before their first login. Existing roles remain managed in the database.

The campus web mode sends legacy browser-only prototype URLs to `/live`; the older mock remains available in the development compose stack only. The API routes still enforce their own authorization, independent of this navigation redirect.

The login uses authorization code with PKCE and a one-use, browser-bound state. The server verifies the ID token through the configured JWKS and creates an opaque eight-hour HttpOnly session. Mutations require the session's CSRF token. Admins approve shops and clubs for verified students using `/live`; self-service `/dev/*` creation is disabled. A session can be revoked through sign-out or by deleting its row. Set `KART_COOKIE_SECURE=0` only for an isolated HTTP test environment; production cookies require HTTPS.

Campus admins can also suspend or reinstate students in `/live`; suspension revokes all their browser sessions immediately. The `/ready` probe checks the database and mandatory identity configuration. API responses carry a request ID, and the backend logs that ID with method, path, status and duration. The backend rejects requests with a declared body larger than 8 MB; enforce a streaming limit and rate limits at the HTTPS edge as well.

For a consistent local backup while the app is running, invoke `python -m app.backup /backups/kart-YYYYMMDD` inside the backend container with a mounted, private backup directory. The command snapshots SQLite through its backup API, copies referenced PDFs, verifies SHA-256 digests, and writes a manifest. Encrypt the snapshot and ship it off host. Test restoration by stopping the backend, restoring `kart.db` and `uploads/` to the **same paths** in a fresh volume, starting the service, and checking `/ready` plus a private document download. Backups are not a substitute for an external retention and disaster-recovery policy.

`KART_DISABLE_KC=1` stops new KC ledger postings, including purchase, task acceptance, and paid ticket registration. Payment-related UI remains a preview and returns an explicit error on those actions. This configuration has **not** been validated for a real campus launch. It still needs an externally operated OIDC tenant, deployed TLS, rate limits at the edge, threat review, incident handling, backups and restore drills, private file retention and malware controls, reliable schema migration tooling, and load testing. SQLite WAL and local uploads require a **single** backend instance and durable storage. Do not scale this configuration horizontally or use local ephemeral storage. Keep the demo database separate from any campus environment. Once the payment model is approved, replace the simulated KC subsystem rather than enabling it with real funds.

Run `PYTHONPATH=backend python -m unittest discover -s backend/tests -v` from the repository root. CI installs FastAPI and HTTPX and runs an HTTP integration test in addition to the service tests. The web workflow runs type checking, unit tests and the Next.js build.
