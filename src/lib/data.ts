import "server-only";
import { createClient } from "@/lib/supabase/server";
import { selectAll } from "@/lib/supabase/selectAll";
import { parisToday } from "@/lib/contacts/normalize";
import { assessUpcoming, type FillEvent } from "@/lib/tournaments/fill";

/** Lectures des pages, avec la session de l'utilisateur (RLS équipe). */

interface EventJoinRow {
  id: string;
  label: string;
  nature: string | null;
  age_category: string | null;
  padel_category: string | null;
  starts_on: string | null;
  registered_count: number | null;
  tournaments: { label: string; moja_hom_id: number } | null;
}

export async function loadFillStatuses() {
  const db = await createClient();
  // Sans types générés, supabase-js type la relation comme un tableau ; c'est
  // en réalité un objet (clé étrangère vers un seul tournoi).
  const { data, error } = await selectAll<EventJoinRow>(
    (from, to) =>
      db
        .from("tournament_events")
        .select("id, label, nature, age_category, padel_category, starts_on, registered_count, tournaments(label, moja_hom_id)")
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: EventJoinRow[] | null; error: { message: string } | null }>,
  );
  if (error) throw new Error(error.message);
  const events: (FillEvent & { homId: number | null })[] = data.map((e) => ({
    id: e.id,
    label: e.label,
    tournamentLabel: e.tournaments?.label ?? "—",
    homId: e.tournaments?.moja_hom_id ?? null,
    nature: e.nature,
    ageCategory: e.age_category,
    padelCategory: e.padel_category,
    startsOn: e.starts_on,
    registeredCount: e.registered_count ?? 0,
  }));
  return assessUpcoming(events, parisToday());
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function loadDashboardStats() {
  const db = await createClient();
  const since30 = daysAgoIso(30);
  const [contacts, newContacts, conversions, optIn, syncs] = await Promise.all([
    db.from("contacts").select("id", { count: "exact", head: true }),
    db.from("contacts").select("id", { count: "exact", head: true }).gte("first_seen_at", since30),
    db.from("conversions").select("id", { count: "exact", head: true }).gte("occurred_at", since30),
    db.from("consents").select("contact_id", { count: "exact", head: true }).eq("channel", "email").eq("status", "granted"),
    db.from("sync_runs").select("source, status, started_at, finished_at, counts, error").order("started_at", { ascending: false }).limit(10),
  ]);
  const lastBySource = new Map<string, NonNullable<typeof syncs.data>[number]>();
  for (const s of syncs.data ?? []) if (!lastBySource.has(s.source)) lastBySource.set(s.source, s);
  return {
    contacts: contacts.count ?? 0,
    newContacts30: newContacts.count ?? 0,
    conversions30: conversions.count ?? 0,
    emailOptIn: optIn.count ?? 0,
    lastSyncs: lastBySource,
  };
}
