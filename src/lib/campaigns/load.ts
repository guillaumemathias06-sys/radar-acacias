import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { selectAll } from "@/lib/supabase/selectAll";
import { buildAudience, type AudienceContact, type AudienceScope, type PastRegistration } from "./audience";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface UpcomingPadelEvent {
  eventId: string;
  tournament: string;
  event: string;
  nature: string | null;
  padelCategory: string | null;
  startsOn: string | null;
  closesAt: string | null;
  registered: number | null;
}

/** Épreuves de padel à venir dont les inscriptions ne sont pas closes. */
export async function upcomingPadelEvents(db: AdminClient, clubId: string, days = 30): Promise<{ data: UpcomingPadelEvent[]; error: string | null }> {
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("tournament_events")
    .select("id, label, nature, padel_category, starts_on, registration_closes_at, registered_count, tournaments!inner(label, club_id, starts_on)")
    .eq("tournaments.club_id", clubId)
    .not("padel_category", "is", null)
    .gte("tournaments.starts_on", today)
    .lte("tournaments.starts_on", until);
  if (error) return { data: [], error: error.message };
  const now = Date.now();
  const rows = (data ?? [])
    .map((e) => {
      const t = e.tournaments as unknown as { label: string; starts_on: string | null };
      return { eventId: e.id, tournament: t.label, event: e.label, nature: e.nature, padelCategory: e.padel_category, startsOn: e.starts_on ?? t.starts_on, closesAt: e.registration_closes_at, registered: e.registered_count };
    })
    .filter((e) => !e.closesAt || new Date(e.closesAt).getTime() > now)
    .sort((a, b) => (a.startsOn ?? "").localeCompare(b.startsOn ?? ""));
  return { data: rows, error: null };
}

/** Audience d'une épreuve, calculée sur toute la base (inscriptions, contacts, consentements, désinscriptions). */
export async function audienceFor(db: AdminClient, clubId: string, eventId: string, scope: AudienceScope) {
  const { data: target, error: targetError } = await db.from("tournament_events").select("id, label, nature, padel_category, tournaments!inner(label, club_id)").eq("id", eventId).eq("tournaments.club_id", clubId).maybeSingle();
  if (targetError) throw new Error(`Lecture de l'épreuve : ${targetError.message}`);
  if (!target) throw new Error("Épreuve introuvable.");

  type EventInfo = { nature: string | null; padel_category: string | null };
  const regs = await selectAll<{ id: string; contact_id: string; event_id: string; tournament_events: unknown }>((from, to) =>
    db.from("tournament_registrations").select("id, contact_id, event_id, tournament_events!inner(nature, padel_category)").not("tournament_events.padel_category", "is", null).order("id").range(from, to),
  );
  if (regs.error) throw new Error(`Lecture des inscriptions : ${regs.error.message}`);
  const contacts = await selectAll<AudienceContact>((from, to) => db.from("contacts").select("id, email, first_name, last_name, gender").eq("club_id", clubId).order("id").range(from, to));
  if (contacts.error) throw new Error(`Lecture des contacts : ${contacts.error.message}`);
  const denied = await selectAll<{ contact_id: string }>((from, to) => db.from("consents").select("contact_id").eq("channel", "email").eq("status", "denied").order("contact_id").range(from, to));
  if (denied.error) throw new Error(`Lecture des consentements : ${denied.error.message}`);
  const suppressed = await selectAll<{ id: string; email: string | null }>((from, to) => db.from("suppressions").select("id, email").eq("club_id", clubId).in("channel", ["email", "all"]).order("id").range(from, to));
  if (suppressed.error) throw new Error(`Lecture des désinscriptions : ${suppressed.error.message}`);

  const past: PastRegistration[] = regs.data.map((r) => {
    const e = (Array.isArray(r.tournament_events) ? r.tournament_events[0] : r.tournament_events) as EventInfo;
    return { contactId: r.contact_id, eventId: r.event_id, nature: e.nature, padelCategory: e.padel_category };
  });
  const t = target.tournaments as unknown as { label: string };
  const result = buildAudience({ eventId: target.id, nature: target.nature, padelCategory: target.padel_category }, past, contacts.data, {
    scope,
    deniedContactIds: new Set(denied.data.map((d) => d.contact_id)),
    suppressedEmails: new Set(suppressed.data.map((s) => s.email?.toLowerCase()).filter((e): e is string => Boolean(e))),
  });
  return { ...result, target: { id: target.id, tournament: t.label, event: target.label, padelCategory: target.padel_category } };
}
