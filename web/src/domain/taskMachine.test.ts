import { describe, expect, it } from 'vitest';
import { isTerminal, milestoneRule, next, TRANSITIONS, type TaskEvent, type TaskStatus } from './taskMachine';

describe('task state machine', () => {
  it('walks the happy path and releases escrow only on approval', () => {
    let s: TaskStatus = 'draft';
    const effects: string[] = [];
    for (const e of ['publish', 'first_bid', 'accept_bid', 'start_work', 'submit_work', 'approve'] as TaskEvent[]) {
      const t = next(s, e);
      expect(t, `${s} --${e}-->`).not.toBeNull();
      effects.push(t!.effect);
      s = t!.to;
    }
    expect(s).toBe('completed');
    expect(effects).toEqual(['none', 'none', 'escrow_reserve', 'none', 'none', 'escrow_release']);
  });
  it('allows accepting a bid straight from open (urgent instant-accept)', () => {
    expect(next('open', 'accept_bid')?.to).toBe('assigned');
  });
  it('rejects illegal transitions', () => {
    expect(next('open', 'approve')).toBeNull();
    expect(next('draft', 'accept_bid')).toBeNull();
    expect(next('completed', 'cancel')).toBeNull();
    expect(next('review', 'publish')).toBeNull();
  });
  it('refunds escrow when cancelling after assignment, but not before', () => {
    expect(next('open', 'cancel')?.effect).toBe('none');
    expect(next('assigned', 'cancel')?.effect).toBe('escrow_refund');
    expect(next('in_progress', 'cancel')?.effect).toBe('escrow_refund');
  });
  it('does not allow cancelling work that is already in review (must dispute instead)', () => {
    expect(next('review', 'cancel')).toBeNull();
    expect(next('review', 'open_dispute')?.to).toBe('disputed');
  });
  it('only a platform admin resolves a dispute', () => {
    expect(next('disputed', 'resolve_dispute')?.permission).toBe('dispute:resolve');
  });
  it('has no outgoing transitions from terminal states', () => {
    for (const s of ['completed', 'cancelled', 'resolved'] as TaskStatus[]) {
      expect(isTerminal(s)).toBe(true);
      expect(Object.keys(TRANSITIONS[s])).toHaveLength(0);
    }
  });
});

describe('milestoneRule', () => {
  it('requires 2+ for long-term and at most 1 for urgent', () => {
    expect(milestoneRule('long_term', 1)).not.toBeNull();
    expect(milestoneRule('long_term', 3)).toBeNull();
    expect(milestoneRule('urgent', 2)).not.toBeNull();
    expect(milestoneRule('urgent', 1)).toBeNull();
    expect(milestoneRule('normal', 1)).toBeNull();
    expect(milestoneRule('normal', 0)).not.toBeNull();
  });
});
