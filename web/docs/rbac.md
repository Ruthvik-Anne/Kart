# RBAC and role-based UI

Source of truth: `src/rbac/policy.ts`. Nothing else decides who sees or does what.

## Model
- **Roles:** `student`, `vendor` (with `storeType`: canteen | xerox | stationery | merch), `campus_admin`, `platform_admin`.
- **Capabilities** are not roles. `providerEnabled` on a student unlocks the Provider Hub, service listings and bidding rights after campus-admin verification.
- **Permissions** are `resource:action` strings (`task:post`, `store:orders:update`, `ledger:view:all`, ...). Each role maps to a list in `ROLE_PERMISSIONS`.
- **Ownership scoping:** `can(user, permission, resource)` adds checks such as "only the poster approves", "only the poster or assignee uses a thread", "a vendor only touches their own store".

## How the UI adapts
1. `navFor(user)` filters `NAV` through `can()`, role restrictions and store type. The sidebar renders whatever comes back, so a canteen sees Menu and Order queue, a Xerox shop sees Print queue and Pricing, and students never see store or admin entries.
2. `canVisit(user, pathname)` guards routes using the longest matching nav prefix. `Shell` renders a 403 page instead of the content.
3. `<Can perm=...>` hides buttons and sections.
4. `homeFor(user)` sends each role to its own landing page.

## Enforcement
The front-end checks are UX only. `src/mock/db.ts` re-checks every action server-style (permission, ownership, state), and these checks are unit-tested (`src/mock/db.test.ts`, `src/rbac/policy.test.ts`). The FastAPI backend must repeat them: treat `policy.ts` as the specification to port.

## Role matrix
| Role | Pages |
|---|---|
| Student | Dashboard, Food, Xerox, Supplies, Services, Task Board, My Tasks, Buy/Sell/Rent, Events, Orders, Messages, Wallet |
| Student + provider | adds Provider Hub |
| Vendor | Console, Settlements, plus Menu/Inventory/Order queue (canteen, stationery, merch) or Print queue/Pricing (xerox) |
| Campus admin | Verification, Vendors, Event approvals, Reports |
| Platform admin | Disputes, Ledger explorer, Audit chain, Fraud alerts, Users & roles, Fees & weights |

## Known gaps before production
Real authentication (OAuth/OIDC + JWT), server-side sessions, role changes through an audited admin flow, per-campus tenancy (`campusId` exists on users but nothing is filtered by it yet) and rate limiting.
