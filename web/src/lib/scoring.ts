// Rule-based ranking. The future backend (OR-Tools matching) mirrors these inputs and outputs.

export type TaskKind = 'urgent' | 'normal' | 'long_term';

export const HORIZON_HOURS: Record<TaskKind, number> = { urgent: 6, normal: 72, long_term: 336 };

export interface PriorityWeights { urgency: number; budget: number; trust: number; age: number }
export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = { urgency: 0.4, budget: 0.25, trust: 0.2, age: 0.15 };

export interface MatchWeights { price: number; reputation: number; availability: number; experience: number; speed: number }
export const DEFAULT_MATCH_WEIGHTS: MatchWeights = { price: 0.3, reputation: 0.25, availability: 0.2, experience: 0.15, speed: 0.1 };

export const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

export interface PriorityInput {
  kind: TaskKind;
  budget: number;
  hoursToDeadline: number;
  hoursSincePosted: number;
  medianBudget: number;      // median budget for the task's category
  posterRating?: number;     // 0-5, undefined for new posters
  posterCompleted?: number;
}

export interface Scored<K extends string> { score: number; parts: Record<K, number> }

const round1 = (n: number) => Math.round(n * 10) / 10;

export function priorityScore(i: PriorityInput, w: PriorityWeights = DEFAULT_PRIORITY_WEIGHTS): Scored<keyof PriorityWeights> {
  const urgency = clamp(1 - i.hoursToDeadline / HORIZON_HOURS[i.kind]);
  const budget = i.medianBudget > 0 ? clamp(i.budget / (i.medianBudget * 1.5)) : 0;
  const trust = i.posterRating === undefined
    ? 0.5
    : clamp(i.posterRating / 5) * clamp((i.posterCompleted ?? 0) / 10);
  const age = clamp(i.hoursSincePosted / 24);
  const raw = 100 * (w.urgency * urgency + w.budget * budget + w.trust * trust + w.age * age);
  const score = Math.min(100, raw + (i.kind === 'urgent' ? 10 : 0));
  return { score: round1(score), parts: { urgency, budget, trust, age } };
}

export interface MatchInput {
  bid: number;
  budget: number;
  etaHours: number;
  hoursToDeadline: number;
  rating: number;            // 0-5 provider rating
  ratingCount: number;
  availability: number;      // 0-1 fraction of the task window free
  completedInCategory: number;
}

// Bayesian smoothing so a single 5.0 review doesn't outrank a long track record.
const PRIOR_RATING = 4.0;
const PRIOR_WEIGHT = 5;

export function matchScore(i: MatchInput, w: MatchWeights = DEFAULT_MATCH_WEIGHTS): Scored<keyof MatchWeights> {
  const over = Math.max(0, i.bid - i.budget) / Math.max(1, i.budget);
  const under = Math.max(0, i.budget - i.bid) / Math.max(1, i.budget);
  const price = clamp(1 - over + Math.min(0.1, under * 0.25)); // small bonus for coming in under budget
  const smoothed = (i.rating * i.ratingCount + PRIOR_RATING * PRIOR_WEIGHT) / (i.ratingCount + PRIOR_WEIGHT);
  const reputation = clamp(smoothed / 5);
  const availability = clamp(i.availability);
  const experience = clamp(i.completedInCategory / 10);
  const speed = i.hoursToDeadline > 0 ? clamp(1 - i.etaHours / i.hoursToDeadline) : 0;
  const raw = 100 * (w.price * price + w.reputation * reputation + w.availability * availability
    + w.experience * experience + w.speed * speed);
  return { score: round1(Math.min(100, raw)), parts: { price, reputation, availability, experience, speed } };
}

/** Net payout to the provider after the platform fee (integer KC, fee rounded up in the platform's favour). */
export function netPayout(amount: number, feeRate: number): { fee: number; net: number } {
  const fee = Math.ceil(amount * feeRate);
  return { fee, net: amount - fee };
}
