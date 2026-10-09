import type { Permission } from '@/rbac/policy';
import type { TaskKind } from '@/lib/scoring';

export type TaskStatus =
  | 'draft' | 'open' | 'bidding' | 'assigned' | 'in_progress' | 'review'
  | 'completed' | 'cancelled' | 'disputed' | 'resolved';

export type TaskEvent =
  | 'publish' | 'first_bid' | 'accept_bid' | 'start_work' | 'submit_work'
  | 'approve' | 'request_changes' | 'cancel' | 'open_dispute' | 'resolve_dispute';

export type LedgerEffect = 'none' | 'escrow_reserve' | 'escrow_release' | 'escrow_refund';
export type Actor = 'poster' | 'assignee' | 'bidder' | 'either' | 'admin';

export interface Transition { to: TaskStatus; permission: Permission; actor: Actor; effect: LedgerEffect }

const T = (to: TaskStatus, permission: Permission, actor: Actor, effect: LedgerEffect = 'none'): Transition =>
  ({ to, permission, actor, effect });

export const TRANSITIONS: Record<TaskStatus, Partial<Record<TaskEvent, Transition>>> = {
  draft: { publish: T('open', 'task:post', 'poster'), cancel: T('cancelled', 'task:post', 'poster') },
  open: {
    first_bid: T('bidding', 'task:bid', 'bidder'),
    accept_bid: T('assigned', 'task:approve', 'poster', 'escrow_reserve'),
    cancel: T('cancelled', 'task:post', 'poster'),
  },
  bidding: {
    accept_bid: T('assigned', 'task:approve', 'poster', 'escrow_reserve'),
    cancel: T('cancelled', 'task:post', 'poster'),
  },
  assigned: {
    start_work: T('in_progress', 'task:bid', 'assignee'),
    cancel: T('cancelled', 'task:post', 'poster', 'escrow_refund'),
    open_dispute: T('disputed', 'task:view', 'either'),
  },
  in_progress: {
    submit_work: T('review', 'task:bid', 'assignee'),
    cancel: T('cancelled', 'task:post', 'poster', 'escrow_refund'),
    open_dispute: T('disputed', 'task:view', 'either'),
  },
  review: {
    approve: T('completed', 'task:approve', 'poster', 'escrow_release'),
    request_changes: T('in_progress', 'task:approve', 'poster'),
    open_dispute: T('disputed', 'task:view', 'either'),
  },
  disputed: { resolve_dispute: T('resolved', 'dispute:resolve', 'admin') },
  completed: {}, cancelled: {}, resolved: {},
};

export const next = (status: TaskStatus, event: TaskEvent): Transition | null =>
  TRANSITIONS[status][event] ?? null;

export const isTerminal = (s: TaskStatus) => s === 'completed' || s === 'cancelled' || s === 'resolved';

/** Long-term tasks need 2+ milestones; urgent tasks at most 1. */
export function milestoneRule(kind: TaskKind, count: number): string | null {
  if (count < 1) return 'Add at least one milestone.';
  if (kind === 'long_term' && count < 2) return 'Long-term tasks need at least 2 milestones.';
  if (kind === 'urgent' && count > 1) return 'Urgent tasks can have at most 1 milestone.';
  return null;
}
