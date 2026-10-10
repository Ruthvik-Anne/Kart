// Tiny in-memory sliding-window limiter for the auth endpoints.
// Counts attempts that should be throttled (failures); callers clear the
// bucket after a success so legitimate traffic never trips it. A shared store
// (Redis / Postgres) replaces this when the app runs on multiple instances.

interface Bucket { count: number; resetAt: number }

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  if (buckets.size > 5_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

/** Forget a key's failures (called after a successful authentication). */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
