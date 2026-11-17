import "server-only";
import { getPlaytomicToken } from "./tokenManager";
import { checkPlaytomicRateLimit } from "./rateLimiter";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const BASE_URL = "https://thirdparty.playtomic.io";
const MAX_RETRIES = 5; // §17
// §16 — documented sequence: 1s → 2s → 4s → 8s → 16s.
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000];

export function isTransientPlaytomicError(httpStatus: number | undefined): boolean {
  return httpStatus === 429 || (typeof httpStatus === "number" && httpStatus >= 500);
}

export interface PlaytomicRetryDecision {
  shouldRetry: boolean;
  delayMs?: number;
}

/**
 * Pure and unit-testable — same shape as decidePublishRetry
 * (src/lib/social/publish.ts). §16 — a reasonable jitter, never a
 * synchronized retry storm; §17 — never retries past MAX_RETRIES, and
 * never retries a non-transient status at all (a 4xx credential/data
 * problem retrying itself would just be a slower way to fail).
 */
export function decidePlaytomicRetry(attempt: number, httpStatus: number | undefined, maxRetries: number = MAX_RETRIES): PlaytomicRetryDecision {
  if (!isTransientPlaytomicError(httpStatus) || attempt >= maxRetries) return { shouldRetry: false };
  const base = BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
  const jitter = Math.floor(Math.random() * 250);
  return { shouldRetry: true, delayMs: base + jitter };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PlaytomicRequestResult<T> {
  data: T | null;
  error?: string;
}

/**
 * The one place that ever calls thirdparty.playtomic.io (§12 —
 * "ne pas disperser des fetch() Playtomic dans plusieurs modules").
 * Attaches the Bearer token via the token manager, self-throttles via
 * the rate limiter BEFORE every attempt (including retries — a retry
 * still counts against the window), retries a transient error with
 * backoff, and never retries a permanent one.
 */
export async function playtomicRequest<T>(db: AdminClient, venueId: string, path: string, searchParams: Record<string, string | undefined>): Promise<PlaytomicRequestResult<T>> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const rateLimit = checkPlaytomicRateLimit();
    if (!rateLimit.allowed) return { data: null, error: rateLimit.reason };

    const { token, error: tokenError } = await getPlaytomicToken(db, venueId);
    if (!token) return { data: null, error: tokenError ?? "token_unavailable" };

    const url = new URL(path, BASE_URL);
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as T | null;
        return { data: json };
      }
      const decision = decidePlaytomicRetry(attempt, res.status);
      if (decision.shouldRetry && decision.delayMs) {
        await sleep(decision.delayMs);
        continue;
      }
      return { data: null, error: `Playtomic a répondu ${res.status} sur ${path}.` };
    } catch (err) {
      const message = err instanceof Error ? err.message : "erreur_inconnue";
      // A network/timeout error carries no HTTP status — treated as
      // transient up to the same MAX_RETRIES ceiling, never unbounded.
      if (attempt >= MAX_RETRIES) return { data: null, error: message };
      const delay = BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
      await sleep(delay + Math.floor(Math.random() * 250));
    }
  }
  return { data: null, error: "max_retries_exceeded" };
}

// §18 — page-based pagination: keep requesting until the page returns
// fewer items than requested (no total count is ever provided).
export interface PageBasedParams {
  page: number;
  size: number;
}

export async function fetchAllPages<T>(fetchPage: (params: PageBasedParams) => Promise<PlaytomicRequestResult<T[]>>, size: number = 100, maxPages: number = 50): Promise<{ items: T[]; error?: string }> {
  const items: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage({ page, size });
    if (result.error) return { items, error: result.error };
    const received = result.data ?? [];
    items.push(...received);
    if (received.length < size) break;
  }
  return { items };
}

// §19 — cursor-based pagination: follow next_cursor_id until has_more
// is false.
export interface CursorPage<T> {
  data: T[];
  has_more: boolean;
  next_cursor_id: string | null;
  last_modified?: string | null;
}

export async function fetchAllCursor<T>(fetchPage: (cursorId: string | undefined) => Promise<PlaytomicRequestResult<CursorPage<T>>>, maxPages: number = 100): Promise<{ items: T[]; lastModified?: string | null; error?: string }> {
  const items: T[] = [];
  let cursorId: string | undefined;
  let lastModified: string | null | undefined;
  for (let i = 0; i < maxPages; i++) {
    const result = await fetchPage(cursorId);
    if (result.error) return { items, lastModified, error: result.error };
    const page = result.data;
    if (!page) break;
    items.push(...page.data);
    lastModified = page.last_modified;
    if (!page.has_more || !page.next_cursor_id) break;
    cursorId = page.next_cursor_id;
  }
  return { items, lastModified };
}
