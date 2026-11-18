import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { chunk } from "@/lib/supabase/batch";
import { channelIdByName, loadAllContacts } from "@/lib/contacts/load";
import { parisToday } from "@/lib/contacts/normalize";
import { CHANNEL_NAMES } from "@/lib/club";
import { planMojaIngest } from "./plan";
import type { MojaSnapshot } from "./schemas";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface MojaIngestResult {
  ok: boolean;
  runId: string | null;
  counts: Record<string, number>;
  warnings: string[];
  error?: string;
}

/**
 * Exécute le plan calculé par planMojaIngest(). Chaque étape vérifie son
 * erreur : au premier échec, la synchronisation est marquée « failed »
 * avec le vrai message — jamais bloquée en « running » ni silencieuse.
 */
export async function ingestMojaSnapshot(db: AdminClient, clubId: string, snapshot: MojaSnapshot): Promise<MojaIngestResult> {
  const { data: run } = await db.from("sync_runs").insert({ club_id: clubId, source: "moja" }).select("id").single();
  const runId: string | null = run?.id ?? null;

  const finish = async (status: "completed" | "partial" | "failed", counts: Record<string, number>, error?: string) => {
    if (runId) await db.from("sync_runs").update({ status, counts, error: error ?? null, finished_at: new Date().toISOString() }).eq("id", runId);
  };

  try {
    const existing = await loadAllContacts(db, clubId);
    if (existing.error) throw new Error(`Lecture des contacts : ${existing.error.message}`);

    const { data: club, error: clubError } = await db.from("clubs").select("fft_club_code").eq("id", clubId).single();
    if (clubError) throw new Error(`Lecture du club : ${clubError.message}`);

    const today = parisToday();
    const plan = planMojaIngest(snapshot, existing.data, { today, clubCode: club.fft_club_code });
    const tournamentChannel = await channelIdByName(db, clubId, CHANNEL_NAMES.tournaments);

    // 1. Tournois → ids Radar
    const homToId = new Map<number, string>();
    for (const part of chunk(plan.tournaments)) {
      const { data, error } = await db
        .from("tournaments")
        .upsert(part.map((t) => ({ ...t, club_id: clubId, synced_at: new Date().toISOString() })), { onConflict: "moja_hom_id" })
        .select("id, moja_hom_id");
      if (error) throw new Error(`Tournois : ${error.message}`);
      for (const row of data ?? []) homToId.set(Number(row.moja_hom_id), row.id);
    }

    // 2. Épreuves → ids Radar
    const eprToId = new Map<number, string>();
    for (const part of chunk(plan.events)) {
      const rows = part.map(({ moja_hom_id, ...e }) => ({ ...e, tournament_id: homToId.get(moja_hom_id)!, synced_at: new Date().toISOString() }));
      const { data, error } = await db.from("tournament_events").upsert(rows, { onConflict: "moja_epr_id" }).select("id, moja_epr_id");
      if (error) throw new Error(`Épreuves : ${error.message}`);
      for (const row of data ?? []) eprToId.set(Number(row.moja_epr_id), row.id);
    }

    // 3. Contacts : créations puis mises à jour
    for (const part of chunk(plan.contactsToInsert)) {
      const rows = part.map((c) => ({ ...c, club_id: clubId, acquisition_channel_id: tournamentChannel, first_seen_at: c.first_seen_at ?? new Date().toISOString() }));
      const { error } = await db.from("contacts").insert(rows);
      if (error) throw new Error(`Création de contacts : ${error.message}`);
    }
    for (const part of chunk(plan.contactsToUpdate)) {
      const rows = part.map((c) => ({ ...c, club_id: clubId, first_seen_at: c.first_seen_at ?? undefined, updated_at: new Date().toISOString() }));
      const { error } = await db.from("contacts").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`Mise à jour de contacts : ${error.message}`);
    }

    // 4. Identités FFT (provenance), consentements « inconnu » par défaut
    for (const part of chunk(plan.identities)) {
      const { error } = await db
        .from("contact_identities")
        .upsert(part.map((i) => ({ ...i, source: "moja" })), { onConflict: "source,external_id", ignoreDuplicates: true });
      if (error) throw new Error(`Identités : ${error.message}`);
    }
    for (const part of chunk(plan.consentCandidates)) {
      const rows = part.map((c) => ({ ...c, status: "unknown", legal_basis: null, source: "moja_inscription" }));
      // ignoreDuplicates : un consentement déjà connu (accordé ou refusé) n'est jamais écrasé.
      const { error } = await db.from("consents").upsert(rows, { onConflict: "contact_id,channel", ignoreDuplicates: true });
      if (error) throw new Error(`Consentements : ${error.message}`);
    }

    // 5. Inscriptions, conversions, disponibilités, photo du remplissage
    for (const part of chunk(plan.registrations)) {
      const rows = part.map(({ moja_epr_id, ...r }) => ({ ...r, event_id: eprToId.get(moja_epr_id)!, synced_at: new Date().toISOString() }));
      const { error } = await db.from("tournament_registrations").upsert(rows, { onConflict: "moja_ins_id,contact_id" });
      if (error) throw new Error(`Inscriptions : ${error.message}`);
    }
    for (const part of chunk(plan.conversions)) {
      const rows = part.map((c) => ({ ...c, club_id: clubId, type: "tournament_registration", source_system: "moja", attributed_channel_id: tournamentChannel }));
      const { error } = await db.from("conversions").upsert(rows, { onConflict: "source_system,external_ref", ignoreDuplicates: true });
      if (error) throw new Error(`Conversions : ${error.message}`);
    }
    for (const part of chunk(plan.availabilities)) {
      const rows = part.map(({ moja_hom_id, ...a }) => ({ ...a, tournament_id: homToId.get(moja_hom_id)! }));
      const { error } = await db.from("player_availabilities").upsert(rows, { onConflict: "tournament_id,contact_id" });
      if (error) throw new Error(`Disponibilités : ${error.message}`);
    }
    for (const part of chunk(plan.fillSnapshots)) {
      const rows = part.map((s) => ({ event_id: eprToId.get(s.moja_epr_id)!, snapshot_date: today, registered_count: s.registered_count }));
      const { error } = await db.from("event_fill_snapshots").upsert(rows, { onConflict: "event_id,snapshot_date" });
      if (error) throw new Error(`Remplissage : ${error.message}`);
    }

    const status = plan.warnings.length ? "partial" : "completed";
    await finish(status, plan.counts, plan.warnings.join("\n") || undefined);
    return { ok: true, runId, counts: plan.counts, warnings: plan.warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    await finish("failed", {}, message);
    return { ok: false, runId, counts: {}, warnings: [], error: message };
  }
}
