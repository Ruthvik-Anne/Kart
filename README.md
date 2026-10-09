# KART

A campus commerce platform: food and canteens, Xerox and print, academic supplies, student services, a ranked task marketplace with private chat and escrow, buy/sell/rent, events, and a double-entry KC wallet, with separate experiences for students, providers, vendors, campus admins and platform admins.

The application lives in [`web/`](web/README.md) (Next.js, TypeScript, Tailwind).

## Run
```
npm run install:web   # once
npm run dev           # http://localhost:3000 then pick a demo user at /login
npm test              # unit and integration tests
npm run test:e2e      # real-browser walkthrough (needs Chrome; start the app first)
```

## Release boundary
The front-end runs against an in-browser mock backend with sample campus data. KC is simulated and has no monetary value. Real authentication, the FastAPI/PostgreSQL services, payment-partner (PPI) integration, file storage and campus tenancy are not connected yet. Do not use it for real transactions or sensitive documents. See [`web/README.md`](web/README.md) and [`web/docs/`](web/docs) for the design of RBAC, the ledger, the audit chain and task communication.
