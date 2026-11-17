import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { chunk } from "@/lib/supabase/batch";
import { selectAll } from "@/lib/supabase/selectAll";
import { channelIdByName, loadAllContacts } from "@/lib/contacts/load";
import { CHANNEL_NAMES } from "@/lib/club";
import { fetchAllPages } from "./apiClient";
import { getBookings } from "./provider";
import { planPlaytomicIngest, type PlaytomicBookingInput } from "./plan";

type AdminClient = ReturnType<typeof createAdminClient>;

const DAY_MS = 86_400_000;

/** Fenêtres de 7 jours : Playtomic limite la plage de dates d'une requête. */
export function dateWindows(days: number, now: Date = new Date()): { start: string; end: string }[] {
  const windows: { start: string; end: string }[] = [];
  for (let offset = days; offset > 0; offset -= 7) {
    const start = new Date(now.getTime() - offset * DAY_MS);
    const end = new Date(Math.min(now.getTime(), start.getTime() + 7 * DAY_MS - 1000));
    windows.push({ start: start.toISOString().slice(0, 19), end: end.toISOString().slice(0, 19) });
  }
  return windows;
}

export async function syncPlaytomic(db: AdminClient, clubId: string, days = 3): Promise<{ ok: boolean; counts: Record<string, number>; error?: string }> {
  const { data: connection } = await db.from("playtomic_connections").select("venue_id, status").eq("club_id", clubId).eq("status", "connected").maybeSingle();
  if (!connection) return { ok: false, counts: {}, error: "Playtomic n'est pas connecté." };

  const { data: run } = await db.from("sync_runs").insert({ club_id: clubId, source: "playtomic" }).select("id").single();
  const finish = async (status: "completed" | "partial" | "failed", counts: Record<string, number>, error?: string) => {
    if (run?.id) await db.from("sync_runs").update({ status, counts, error: error ?? null, finished_at: new Date().toISOString() }).eq("id", run.id);
  };

  try {
    const bookings: PlaytomicBookingInput[] = [];
    let skipped = 0;
    for (const w of dateWindows(days)) {
      const { items, error } = await fetchAllPages(async ({ page, size }) => {
        const { result, error: e } = await getBookings(db, connection.venue_id, { startBookingDate: w.start, endBookingDate: w.end, page, size });
        if (result) skipped += result.skipped;
        return { data: result?.bookings ?? null, error: e };
      });
      if (error) throw new Error(`Réservations ${w.start} → ${w.end} : ${error}`);
      bookings.push(...(items as PlaytomicBookingInput[]));
    }

    const contacts = await loadAllContacts(db, clubId);
    if (contacts.error) throw new Error(`Lecture des contacts : ${contacts.error.message}`);
    const idents = await selectAll<{ contact_id: string; external_id: string }>((from, to) =>
      db.from("contact_identities").select("contact_id, external_id").eq("source", "playtomic").order("id").range(from, to),
    );
    if (idents.error) throw new Error(`Lecture des identités : ${idents.error.message}`);

    const plan = planPlaytomicIngest(bookings, contacts.data, new Map(idents.data.map((i) => [i.external_id, i.contact_id])));
    const channel = await channelIdByName(db, clubId, CHANNEL_NAMES.playtomic);

    for (const part of chunk(plan.contactsToInsert)) {
      const { error } = await db.from("contacts").insert(part.map((c) => ({ ...c, club_id: clubId, acquisition_channel_id: channel, first_seen_at: c.first_seen_at ?? new Date().toISOString() })));
      if (error) throw new Error(`Création de contacts : ${error.message}`);
    }
    for (const part of chunk(plan.contactsToUpdate)) {
      const { error } = await db.from("contacts").upsert(part.map((c) => ({ ...c, club_id: clubId, first_seen_at: c.first_seen_at ?? undefined, updated_at: new Date().toISOString() })), { onConflict: "id" });
      if (error) throw new Error(`Mise à jour de contacts : ${error.message}`);
    }
    for (const part of chunk(plan.identities)) {
      const { error } = await db.from("contact_identities").upsert(part.map((i) => ({ ...i, source: "playtomic" })), { onConflict: "source,external_id", ignoreDuplicates: true });
      if (error) throw new Error(`Identités : ${error.message}`);
    }
    // Consentement explicite Playtomic → « accordé » (écrase « inconnu », jamais un refus).
    const granted = plan.emailConsents.filter((c) => c.granted);
    for (const part of chunk(granted)) {
      const ids = part.map((c) => c.contact_id);
      const { data: refused } = await db.from("consents").select("contact_id").eq("channel", "email").eq("status", "denied").in("contact_id", ids);
      const refusedIds = new Set((refused ?? []).map((r) => r.contact_id));
      const rows = part.filter((c) => !refusedIds.has(c.contact_id)).map((c) => ({ contact_id: c.contact_id, channel: "email", status: "granted", legal_basis: "consent", source: "playtomic", recorded_at: new Date().toISOString() }));
      const { error } = await db.from("consents").upsert(rows, { onConflict: "contact_id,channel" });
      if (error) throw new Error(`Consentements : ${error.message}`);
    }
    const unknown = plan.emailConsents.filter((c) => !c.granted).map((c) => ({ contact_id: c.contact_id, channel: "email", status: "unknown", source: "playtomic" }));
    for (const part of chunk(unknown)) {
      const { error } = await db.from("consents").upsert(part, { onConflict: "contact_id,channel", ignoreDuplicates: true });
      if (error) throw new Error(`Consentements : ${error.message}`);
    }
    for (const part of chunk(plan.conversions)) {
      const rows = part.map((c) => ({ ...c, club_id: clubId, type: "booking", source_system: "playtomic", attributed_channel_id: channel }));
      const { error } = await db.from("conversions").upsert(rows, { onConflict: "source_system,external_ref", ignoreDuplicates: true });
      if (error) throw new Error(`Conversions : ${error.message}`);
    }

    const counts = { ...plan.counts, skipped_bookings: skipped };
    await finish(skipped ? "partial" : "completed", counts, skipped ? `${skipped} réservation(s) illisible(s)` : undefined);
    await db.from("playtomic_connections").update({ last_success_at: new Date().toISOString(), last_error: null }).eq("venue_id", connection.venue_id);
    return { ok: true, counts };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    await finish("failed", {}, message);
    await db.from("playtomic_connections").update({ last_error: message, last_error_at: new Date().toISOString() }).eq("venue_id", connection.venue_id);
    return { ok: false, counts: {}, error: message };
  }
}
