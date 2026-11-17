/**
 * Reads EVERY row of a query, page by page.
 *
 * PostgREST (so Supabase) silently caps any read at 1 000 rows — no error, no
 * warning, just the first 1 000 in no particular order. Found 26/10/2026: the
 * occupancy figures Guillaume was watching (Padel "21 %") were computed from
 * 1 000 of the 3 209 stored bookings; the real figure was about three times
 * higher. Any unbounded read of a table that can grow past 1 000 rows must go
 * through this, with a stable `.order("id")` so pages never overlap or skip.
 */
export const SELECT_ALL_PAGE_SIZE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function selectAll<T>(fetchPage: (from: number, to: number) => PageResult<T>): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += SELECT_ALL_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + SELECT_ALL_PAGE_SIZE - 1);
    // A failed page means the total is unknown: report it instead of
    // returning a silently truncated list.
    if (error) return { data: [], error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < SELECT_ALL_PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}
