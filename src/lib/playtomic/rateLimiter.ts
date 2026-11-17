import "server-only";

/**
 * Sprint 013 (P0) — §15 RATE LIMIT self-protection. Same in-memory,
 * per-process shape as src/lib/web/rateLimit.ts, deliberately kept as
 * its own module rather than shared — different provider, a 10-minute
 * window instead of 1, a different ceiling. Same single-instance
 * limitation, disclosed just as honestly: this app has no shared store
 * (Redis/KV) to enforce a limit across multiple instances, so this is
 * a best-effort in-process guard, not a distributed rate limiter.
 */
const WINDOW_MS = 10 * 60_000;
// Playtomic's real limit is 400 requests / 10 minutes (§15, confirmed
// by the official Conventions page) — stay comfortably under it rather
// than find out what happens right at the edge.
const SELF_IMPOSED_CEILING = 350;

const requestTimestamps: number[] = [];

function prune(now: number): number[] {
  return requestTimestamps.filter((t) => now - t < WINDOW_MS);
}

export interface PlaytomicRateLimitCheck {
  allowed: boolean;
  reason?: string;
}

/** Call BEFORE each outbound Playtomic call. Records the attempt only
 * when allowed, so a refused call never itself counts against the
 * window (same contract as checkRateLimit in web/rateLimit.ts). */
export function checkPlaytomicRateLimit(now: number = Date.now()): PlaytomicRateLimitCheck {
  const recent = prune(now);
  requestTimestamps.length = 0;
  requestTimestamps.push(...recent);
  if (recent.length >= SELF_IMPOSED_CEILING) {
    return { allowed: false, reason: `Limite Playtomic auto-imposée atteinte (${SELF_IMPOSED_CEILING} requêtes / 10 min) — nouvelle tentative plus tard.` };
  }
  requestTimestamps.push(now);
  return { allowed: true };
}

/** §107 SYSTEM HEALTH — "requests_last_10_minutes". Best-effort,
 * in-process only; resets on a cold start like everything else here. */
export function getPlaytomicRateLimitStatus(now: number = Date.now()): { requestsInWindow: number; ceiling: number } {
  return { requestsInWindow: prune(now).length, ceiling: SELF_IMPOSED_CEILING };
}
