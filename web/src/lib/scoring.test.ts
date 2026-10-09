import { describe, expect, it } from 'vitest';
import { matchScore, netPayout, priorityScore, type MatchInput, type PriorityInput } from './scoring';

const task: PriorityInput = { kind: 'normal', budget: 200, hoursToDeadline: 36, hoursSincePosted: 6, medianBudget: 200, posterRating: 4.5, posterCompleted: 10 };
const bid: MatchInput = { bid: 200, budget: 200, etaHours: 6, hoursToDeadline: 36, rating: 4.8, ratingCount: 20, availability: 1, completedInCategory: 10 };

describe('priorityScore', () => {
  it('stays within 0-100', () => {
    const s = priorityScore({ ...task, kind: 'urgent', hoursToDeadline: 0, budget: 9999, hoursSincePosted: 99 }).score;
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
  it('rises as the deadline approaches', () => {
    expect(priorityScore({ ...task, hoursToDeadline: 4 }).score).toBeGreaterThan(priorityScore({ ...task, hoursToDeadline: 60 }).score);
  });
  it('rises with budget and with task age', () => {
    expect(priorityScore({ ...task, budget: 400 }).score).toBeGreaterThan(priorityScore({ ...task, budget: 50 }).score);
    expect(priorityScore({ ...task, hoursSincePosted: 30 }).score).toBeGreaterThan(priorityScore({ ...task, hoursSincePosted: 1 }).score);
  });
  it('gives the urgent kind a +10 boost on otherwise equal inputs', () => {
    const urgent = priorityScore({ ...task, kind: 'urgent', hoursToDeadline: 3 }).score;
    const sameNormalShape = priorityScore({ ...task, kind: 'normal', hoursToDeadline: 36 }).score; // same 50% urgency fraction
    expect(urgent - sameNormalShape).toBeCloseTo(10, 0);
  });
  it('uses a neutral trust for new posters', () => {
    expect(priorityScore({ ...task, posterRating: undefined }).parts.trust).toBe(0.5);
  });
  it('does not blow up when the category median is zero', () => {
    expect(priorityScore({ ...task, medianBudget: 0 }).parts.budget).toBe(0);
  });
});

describe('matchScore', () => {
  it('stays within 0-100', () => {
    expect(matchScore(bid).score).toBeLessThanOrEqual(100);
    expect(matchScore({ ...bid, bid: 99999, etaHours: 999, availability: 0, completedInCategory: 0, rating: 0 }).score).toBeGreaterThanOrEqual(0);
  });
  it('prefers a lower bid and penalises going over budget', () => {
    expect(matchScore({ ...bid, bid: 150 }).score).toBeGreaterThan(matchScore({ ...bid, bid: 260 }).score);
  });
  it('prefers faster ETA, better availability and more experience', () => {
    expect(matchScore({ ...bid, etaHours: 2 }).score).toBeGreaterThan(matchScore({ ...bid, etaHours: 30 }).score);
    expect(matchScore({ ...bid, availability: 1 }).score).toBeGreaterThan(matchScore({ ...bid, availability: 0.2 }).score);
    expect(matchScore({ ...bid, completedInCategory: 10 }).score).toBeGreaterThan(matchScore({ ...bid, completedInCategory: 0 }).score);
  });
  it('smooths ratings so one perfect review does not beat a long track record', () => {
    const veteran = matchScore({ ...bid, rating: 4.7, ratingCount: 60 }).parts.reputation;
    const newcomer = matchScore({ ...bid, rating: 5, ratingCount: 1 }).parts.reputation;
    expect(veteran).toBeGreaterThan(newcomer);
  });
  it('scores speed as zero once the deadline has passed', () => {
    expect(matchScore({ ...bid, hoursToDeadline: 0 }).parts.speed).toBe(0);
  });
});

describe('netPayout', () => {
  it('rounds the fee up and always sums to the amount', () => {
    expect(netPayout(90, 0.05)).toEqual({ fee: 5, net: 85 });
    for (const a of [1, 7, 99, 350, 1234]) {
      const { fee, net } = netPayout(a, 0.05);
      expect(fee + net).toBe(a);
    }
  });
});
