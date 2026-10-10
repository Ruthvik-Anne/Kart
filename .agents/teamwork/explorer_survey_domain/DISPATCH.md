# Dispatch Task for Explorer: Domain Invariants, Business Logic & Test Suite

Your Role: teamwork_preview_explorer
Working Directory: c:\Users\Vishnu\Downloads\Kart\.agents\teamwork\explorer_survey_domain
Project Root: c:\Users\Vishnu\Downloads\Kart
Original Request File: c:\Users\Vishnu\Downloads\Kart\.agents\teamwork\ORIGINAL_REQUEST.md

Objective:
Perform a deep investigation of KART's domain invariants, business logic subsystems, and automated test setup:
1. Double-Entry Ledger Subsystem:
   - Double-entry invariants: zero-sum balance requirement, transaction entry types (debit/credit, accounts).
   - How unbalanced transactions are rejected, balance calculation rules, concurrency/atomicity assumptions.
2. Task Marketplace State Machine:
   - Task lifecycle states (e.g. open, assigned, in_progress, submitted, approved, completed, cancelled, disputed).
   - Valid state transitions, actor permissions per transition, escrow/payout triggers.
3. Retail & Ancillary Subsystems:
   - Retail orders, inventory/cart management, promo code calculation rules, scoring/reputation, theme support.
4. Test Suite & Verification Landscape:
   - Map all 13 test files in Vitest (`npm test`).
   - Identify test coverage across subsystems, test assertions, mock usages, and gaps.

Read `c:\Users\Vishnu\Downloads\Kart\.agents\teamwork\ORIGINAL_REQUEST.md` first.
Write your detailed report to `c:\Users\Vishnu\Downloads\Kart\.agents\teamwork\explorer_survey_domain\handoff.md`.
Report back when complete.
