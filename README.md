# KART

A campus commerce prototype covering food, document services, academic supplies, tasks, student resale and rentals, events, custom merchandise, and student services.

## Run locally

Run `npm run dev` and open <http://127.0.0.1:5173>. No dependency install or build step is required.

Run `npm test` to check page rendering, dialogs, search, purchases, rentals, services, tasks, refunds and demo KC balances.

## What works in this release

- Explore and search all eight modules, filter by category, and save items to a cart.
- Submit demo checkout orders and print requests, track orders, and move vendor orders through their preparation states.
- Post tasks, submit bids, accept a bid, approve or cancel work, and view task conversations.
- Register for events, publish and book student services, cancel demo bookings for a refund, create resale listings, and request short rentals.
- Choose merchandise options and quantities before checkout.
- View a demo KC balance and the corresponding local transaction history.
- Switch between student, vendor, organizer, and admin views. Data is kept in the browser with `localStorage` and can be reset from the profile menu.

## Release boundary

This is a **front-end prototype** with sample campus data. It has no authentication, shared database, real payments, bank settlement, blockchain network, file uploads, secure document storage, or production authorization. KC in this build is simulated and has no monetary value. Do not use the prototype for real transactions or sensitive documents.

Production work needs a server-side identity and permissions system, transactional double-entry ledger, approved payment and settlement arrangement, durable storage, moderation, and security review. The regulatory model for multi-merchant KC and student cash-outs must be resolved before real-money deployment.

## Files

- `index.html` — application shell
- `styles.css` — responsive visual system
- `app.js` — sample data, state, rendering, and browser-local interactions

## KART web (role-based Next.js app)

A fuller, role-based front-end lives in [`web/`](web/README.md): separate experiences for students, providers, vendors (by store type), campus admins and platform admins, a ranked task board with private task chat, a double-entry KC ledger with escrow, and a simulated audit chain. The vanilla prototype above remains for reference.
