# Task board and task communication

## Task types
| Kind | Window | Milestones | Notes |
|---|---|---|---|
| `urgent` (short-term) | due within 6 h | exactly 1 | instant-accept possible from `open` |
| `normal` (short-term) | due within 72 h | 1 or more | bidding window |
| `long_term` | more than 72 h | 2 or more | escrow released per milestone |

Validation lives in `Kart.postTask` and `milestoneRule` (`src/domain/taskMachine.ts`).

## Ranking (`src/lib/scoring.ts`)
Priority (board order), weights editable on the admin Fees page:
`100 x (0.40 urgency + 0.25 budget + 0.20 poster trust + 0.15 age)` plus 10 for urgent tasks, capped at 100.
Match (bid ranking, shown to the poster and as "Your match" to a provider):
`100 x (0.30 price + 0.25 reputation + 0.20 availability + 0.15 experience + 0.10 speed)`. Ratings use Bayesian smoothing so one 5.0 does not beat a track record. OR-Tools assignment is a backend-phase upgrade; the inputs and outputs here are the contract.

## Lifecycle (`taskMachine.ts`)
`open -> bidding -> assigned -> in_progress -> review -> completed`, with `cancelled`, and `disputed -> resolved`. Each transition names the permission, actor and ledger effect (reserve, release, refund). Illegal transitions are rejected and tested.

## Conversations
- Thread key `{taskId}:{bidderId}`: one private thread between the poster and each bidder. There is no public thread in this release.
- Read and write: poster and that bidder only. Other bidders and other students get nothing.
- On acceptance, the other threads get a system message and become read-only.
- Platform admins can read the assignee's thread only while the task is `disputed`; each read writes an admin-access log entry (once per five minutes per thread). They cannot write.
- Anonymous tasks hide the poster's name from everyone but themselves.
- Safeguards: 2,000 character limit, escaped plain-text rendering, a burst limit of 8 messages per 10 seconds, and a soft warning when a message looks like a phone number, email or WhatsApp/Telegram/Instagram handle.
- Realtime: tabs sync through the `storage` event. The backend replaces this with a WebSocket at `/ws/threads/{key}` using the same message shape.

## Not built yet
Attachments, counter-offer quote messages, recurring/scheduled tasks and linked tasks (Phase 2 in the brief).
