import "server-only";
import { z } from "zod";
import { playtomicRequest, type CursorPage } from "./apiClient";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Sprint 013 (P0/P1, hardened 24/09/2026) — real production symptom:
 * every sync since the connection went live read 0 records despite
 * real bookings existing in Playtomic, and every `playtomic_sync_runs`
 * row stayed stuck at `status: "running"` forever. Root cause: `.parse()`
 * throws on the first entry that doesn't exactly match a schema (e.g. a
 * real booking missing `tenant_id`, or a type Playtomic returns
 * differently than documented) — uncaught anywhere in this chain, that
 * crashes the whole cron invocation before it ever reaches the code
 * that marks a sync run "failed" with a real error, so it looks
 * "stuck" rather than honestly broken. `safeParseList` never lets one
 * malformed real entry take down an entire sync — it keeps every valid
 * one and reports how many were skipped, so a genuine schema drift is
 * visible (§skipped) rather than either silently dropped or fatal.
 */
export function safeParseList<T>(schema: z.ZodType<T>, raw: unknown[]): { items: T[]; skipped: number; firstIssue?: string } {
  const items: T[] = [];
  let skipped = 0;
  let firstIssue: string | undefined;
  for (const entry of raw) {
    const result = schema.safeParse(entry);
    if (result.success) items.push(result.data);
    else {
      skipped++;
      // §diagnostic 24/09/2026 — the exact zod issue (which field,
      // why) is the only way to tell a genuine schema drift from a
      // one-off bad entry without guessing; surfaced up into the real
      // sync error message, never swallowed.
      if (!firstIssue) firstIssue = result.error.issues.map((i) => `${i.path.join(".") || "(racine)"}: ${i.message}`).join(" ; ");
    }
  }
  return { items, skipped, firstIssue };
}

/**
 * Sprint 013 (P0) — §12-13 PLAYTOMIC PROVIDER. Exactly the three
 * endpoints the audit confirmed exist (see the Sprint 013 plan's own
 * capability matrix) — no getVenues()/getCourts()/getMatches()/
 * getRecurringSeries(). Those would not be real API calls, only
 * filtered views over getBookings()'s own `booking_type` field; adding
 * them as separate provider methods would misrepresent what's actually
 * documented (§13's own rule).
 *
 * §110 — schemas use `.passthrough()`: an unknown field Playtomic adds
 * later never fails the whole parse, only the fields Jarvis actually
 * reads are validated at all.
 */
// §hardening 25/09/2026 — real production data confirmed every
// "optional" field below is sent as an explicit JSON `null`, not
// omitted, on a real booking with no value (e.g. a regular court
// booking has no `activity_id`/`course_id` — it comes back as
// `activity_id: null`, not a missing key). Playtomic's own docs
// (third-party.playtomic.io/endpoints/bookings/) call these fields
// "optional" without saying nullable — real behavior disagrees, and
// real behavior is what parsing must match. `.nullish()` (accepts
// both `undefined` and `null`) everywhere `.optional()` was silently
// rejecting every real booking (§skipped: 100/100).
const bookingSchema = z
  .object({
    booking_id: z.string(),
    tenant_id: z.string(),
    resource_id: z.string().nullish(),
    resource_name: z.string().nullish(),
    sport_id: z.string().nullish(),
    booking_start_date: z.string().nullish(),
    booking_end_date: z.string().nullish(),
    duration: z.number().nullish(),
    origin: z.string().nullish(),
    price: z.string().nullish(),
    booking_type: z.string().nullish(),
    payment_status: z.string().nullish(),
    is_canceled: z.boolean().nullish(),
    status: z.string().nullish(),
    activity_id: z.string().nullish(),
    activity_name: z.string().nullish(),
    course_id: z.string().nullish(),
    course_name: z.string().nullish(),
  })
  .passthrough();
export type PlaytomicBooking = z.infer<typeof bookingSchema>;

// §35/§36 — deliberately minimal: only what could plausibly matter for
// occupancy/business context, never a full personal-data mirror.
// `.nullish()` for the same real-null-not-omitted reason as bookings.
const playerSchema = z
  .object({
    player_id: z.string(),
    name: z.string(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
  })
  .passthrough();
export type PlaytomicPlayer = z.infer<typeof playerSchema>;

// §62-65 — real fields not yet confirmed beyond the docs' own summary;
// kept deliberately loose. Nothing reads this until P4.
const paymentSchema = z.object({}).passthrough();
export type PlaytomicPayment = z.infer<typeof paymentSchema>;

export interface BookingsPage {
  bookings: PlaytomicBooking[];
  page: number;
  size: number;
  hasMore: boolean;
  skipped: number;
  firstIssue?: string;
}

export interface GetBookingsParams {
  startBookingDate: string;
  endBookingDate: string;
  page?: number;
  size?: number;
  bookingType?: string;
  sportId?: string;
  status?: string;
  participantId?: string;
}

/** §18 — single page only; P1's real sync loop uses fetchAllPages
 * (apiClient.ts) around this same request shape once it exists. */
export async function getBookings(db: AdminClient, venueId: string, params: GetBookingsParams): Promise<{ result: BookingsPage | null; error?: string }> {
  const page = params.page ?? 0;
  const size = params.size ?? 100;
  const { data, error } = await playtomicRequest<unknown[]>(db, venueId, "/api/v1/bookings", {
    tenant_id: venueId,
    start_booking_date: params.startBookingDate,
    end_booking_date: params.endBookingDate,
    page: String(page),
    size: String(size),
    booking_type: params.bookingType,
    sport_id: params.sportId,
    status: params.status,
    participant_id: params.participantId,
  });
  if (error || !data) return { result: null, error };
  const { items: bookings, skipped, firstIssue } = safeParseList(bookingSchema, data);
  // `hasMore` is judged on the RAW page length, never the post-filter
  // count — a skipped entry must never look like "the page was short"
  // and silently truncate pagination.
  return { result: { bookings, page, size, hasMore: data.length >= size, skipped, firstIssue } };
}

export interface CursorResultPage<T> {
  data: T[];
  hasMore: boolean;
  nextCursorId: string | null;
  lastModified: string | null;
  skipped: number;
}

export interface GetPlayersParams {
  cursorId?: string;
  limit?: number;
  include?: ("BENEFITS" | "SPORTS" | "WALLETS")[];
}

export async function getPlayers(db: AdminClient, venueId: string, params: GetPlayersParams = {}): Promise<{ result: CursorResultPage<PlaytomicPlayer> | null; error?: string }> {
  const { data, error } = await playtomicRequest<CursorPage<unknown>>(db, venueId, `/api/v1/venues/${venueId}/players`, {
    cursor_id: params.cursorId,
    limit: params.limit ? String(params.limit) : undefined,
    include: params.include?.join(","),
  });
  if (error || !data) return { result: null, error };
  const { items: players, skipped } = safeParseList(playerSchema, data.data);
  return { result: { data: players, hasMore: data.has_more, nextCursorId: data.next_cursor_id ?? null, lastModified: data.last_modified ?? null, skipped } };
}

export interface GetPaymentsParams {
  cursorId?: string;
  limit?: number;
  startServiceDate?: string;
  endServiceDate?: string;
  startPaymentDate?: string;
  endPaymentDate?: string;
}

export async function getPayments(db: AdminClient, venueId: string, params: GetPaymentsParams = {}): Promise<{ result: CursorResultPage<PlaytomicPayment> | null; error?: string }> {
  const { data, error } = await playtomicRequest<CursorPage<unknown>>(db, venueId, "/api/v1/payments", {
    tenant_id: venueId,
    cursor_id: params.cursorId,
    limit: params.limit ? String(params.limit) : undefined,
    start_service_date: params.startServiceDate,
    end_service_date: params.endServiceDate,
    start_payment_date: params.startPaymentDate,
    end_payment_date: params.endPaymentDate,
  });
  if (error || !data) return { result: null, error };
  const { items: payments, skipped } = safeParseList(paymentSchema, data.data);
  return { result: { data: payments, hasMore: data.has_more, nextCursorId: data.next_cursor_id ?? null, lastModified: data.last_modified ?? null, skipped } };
}

/**
 * §26 — used only by the connect route's pre-storage test: calls with
 * a freshly-minted token directly, never through the DB-backed token
 * manager (no `playtomic_connections` row exists yet to look up).
 * Proves both the credentials AND the `venue_id` are real before
 * anything gets saved — never used again once connected.
 */
export async function testBookingsAccess(token: string, venueId: string): Promise<{ ok: boolean; error?: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const url = new URL("/api/v1/bookings", "https://thirdparty.playtomic.io");
  url.searchParams.set("tenant_id", venueId);
  url.searchParams.set("start_booking_date", `${today}T00:00:00`);
  url.searchParams.set("end_booking_date", `${today}T23:59:59`);
  url.searchParams.set("size", "1");
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Accès refusé — vérifie l'identifiant du lieu (venue_id)." };
    if (!res.ok) return { ok: false, error: `Playtomic a répondu ${res.status}.` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur réseau lors du test de connexion." };
  }
}
