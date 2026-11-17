import { ContactIndex, mergeContact, type ContactRecord } from "@/lib/contacts/merge";
import { disponibiliteSchema, epreuveSchema, homologationSchema, joueurSchema, safeParseList, type MojaSnapshot } from "./schemas";
import { toAvailability, toContact, toEventRow, toRegistrations, toTournamentRow, type EventRow, type TournamentRow } from "./normalize";

/**
 * Plan d'import Moja, calculé entièrement en mémoire : à partir des
 * réponses brutes et des contacts déjà connus, il dit exactement quoi
 * créer et quoi mettre à jour. L'écriture en base (ingest.ts) ne fait
 * qu'exécuter ce plan — toute la logique métier est ici, et testée.
 */

export interface PlannedEvent extends EventRow {
  moja_hom_id: number;
}

export interface PlannedRegistration {
  moja_epr_id: number;
  contact_id: string;
  moja_ins_id: number;
  status_code: string;
  status: "participant" | "waiting_list" | "other";
  registered_at: string | null;
  amount_due_cents: number | null;
  amount_paid_cents: number | null;
}

export interface PlannedConversion {
  contact_id: string;
  occurred_at: string;
  value_cents: number | null;
  external_ref: string;
}

export interface MojaIngestPlan {
  tournaments: TournamentRow[];
  events: PlannedEvent[];
  contactsToInsert: ContactRecord[];
  contactsToUpdate: ContactRecord[];
  identities: { contact_id: string; external_id: string }[];
  registrations: PlannedRegistration[];
  conversions: PlannedConversion[];
  availabilities: { moja_hom_id: number; contact_id: string; general: unknown; specific: unknown; updated_on: string | null }[];
  fillSnapshots: { moja_epr_id: number; registered_count: number }[];
  /** Contacts nouveaux ou existants qui ont un e-mail ou un téléphone : on
   * crée une ligne de consentement « inconnu » s'il n'y en a pas déjà. */
  consentCandidates: { contact_id: string; channel: "email" | "sms" }[];
  warnings: string[];
  counts: Record<string, number>;
}

export function planMojaIngest(snapshot: MojaSnapshot, existing: ContactRecord[], options: { today: string; newId?: () => string }): MojaIngestPlan {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const warnings: string[] = [];

  const homs = safeParseList(homologationSchema, snapshot.homologations);
  if (homs.skipped) warnings.push(`${homs.skipped} homologation(s) illisible(s) : ${homs.firstIssue}`);
  const tournaments = homs.items.map(toTournamentRow);
  const knownHoms = new Set(tournaments.map((t) => t.moja_hom_id));

  const index = new ContactIndex(existing);
  const byId = new Map(existing.map((c) => [c.id, { ...c }]));
  const created = new Set<string>();
  const updated = new Set<string>();
  const contactIdByFft = new Map<number, string>();
  const contactIdByPlayer = new Map<number, string>();

  const events: PlannedEvent[] = [];
  const registrations: PlannedRegistration[] = [];
  const availabilities: MojaIngestPlan["availabilities"] = [];
  const eventDates = new Map<number, string | null>();
  const eventFees = new Map<number, number | null>();

  for (const [homKey, detail] of Object.entries(snapshot.details)) {
    const homId = Number(homKey);
    if (!knownHoms.has(homId)) {
      warnings.push(`Détail reçu pour l'homologation ${homKey}, absente de la liste : ignoré.`);
      continue;
    }

    const eps = safeParseList(epreuveSchema, detail.epreuves);
    if (eps.skipped) warnings.push(`Homologation ${homId} : ${eps.skipped} épreuve(s) illisible(s) : ${eps.firstIssue}`);
    for (const e of eps.items) {
      const row = toEventRow(e);
      events.push({ ...row, moja_hom_id: homId });
      eventDates.set(row.moja_epr_id, row.starts_on);
      eventFees.set(row.moja_epr_id, row.fee_adult_cents);
    }

    const players = safeParseList(joueurSchema, detail.joueurs);
    if (players.skipped) warnings.push(`Homologation ${homId} : ${players.skipped} joueur(s) illisible(s) : ${players.firstIssue}`);

    for (const j of players.items) {
      const incoming = toContact(j);
      const regs = toRegistrations(j);
      const regDates = regs.map((r) => r.registered_at).filter((d): d is string => !!d);
      const playedDates = regs
        .filter((r) => r.status === "participant")
        .map((r) => eventDates.get(r.moja_epr_id))
        .filter((d): d is string => !!d && d <= options.today)
        .map((d) => `${d}T12:00:00.000Z`);
      const firstSeen = regDates.sort()[0] ?? null;
      const lastActivity = [...regDates, ...playedDates].sort().at(-1) ?? null;
      const candidate = { ...incoming, first_seen_at: firstSeen, last_activity_at: lastActivity };

      const match = index.find(candidate);
      let contactId: string;
      if (match) {
        contactId = match.id;
        const current = byId.get(contactId)!;
        const { merged, changed } = mergeContact(current, candidate);
        byId.set(contactId, merged);
        index.add(merged);
        if (changed && !created.has(contactId)) updated.add(contactId);
      } else {
        contactId = newId();
        const record: ContactRecord = {
          id: contactId,
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          email: candidate.email,
          phone: candidate.phone,
          fft_crm_id: candidate.fft_crm_id,
          gender: candidate.gender,
          sporting_age: candidate.sporting_age,
          home_club_code: candidate.home_club_code,
          home_club_name: candidate.home_club_name,
          padel_rank: candidate.padel_rank,
          tennis_rank: candidate.tennis_rank,
          first_seen_at: firstSeen,
          last_activity_at: lastActivity,
        };
        byId.set(contactId, record);
        index.add(record);
        created.add(contactId);
      }
      contactIdByFft.set(j.idCrm, contactId);
      if (incoming.moja_player_id !== null) contactIdByPlayer.set(incoming.moja_player_id, contactId);

      for (const r of regs) {
        registrations.push({
          moja_epr_id: r.moja_epr_id,
          contact_id: contactId,
          moja_ins_id: r.moja_ins_id,
          status_code: r.status_code,
          status: r.status,
          registered_at: r.registered_at,
          amount_due_cents: r.amount_due_cents,
          amount_paid_cents: r.amount_paid_cents,
        });
      }
    }

    const dispos = safeParseList(disponibiliteSchema, detail.disponibilites);
    if (dispos.skipped) warnings.push(`Homologation ${homId} : ${dispos.skipped} disponibilité(s) illisible(s) : ${dispos.firstIssue}`);
    for (const d of dispos.items) {
      const contactId = contactIdByPlayer.get(d.jouId);
      if (!contactId) continue; // disponibilité d'un joueur absent de la liste : rien à rattacher
      const a = toAvailability(d);
      availabilities.push({ moja_hom_id: homId, contact_id: contactId, general: a.general, specific: a.specific, updated_on: a.updated_on });
    }
  }

  // Une même inscription peut apparaître deux fois (joueur listé dans deux
  // paquets de pagination) : on dédoublonne sur la clé unique.
  const uniqueRegs = [...new Map(registrations.map((r) => [`${r.moja_ins_id}|${r.contact_id}`, r])).values()];
  const knownEvents = new Set(events.map((e) => e.moja_epr_id));
  const orphanRegs = uniqueRegs.filter((r) => !knownEvents.has(r.moja_epr_id));
  if (orphanRegs.length) warnings.push(`${orphanRegs.length} inscription(s) à une épreuve inconnue : ignorée(s).`);
  const keptRegs = uniqueRegs.filter((r) => knownEvents.has(r.moja_epr_id));

  const conversions: PlannedConversion[] = keptRegs
    .filter((r) => r.status === "participant" && r.registered_at)
    .map((r) => ({
      contact_id: r.contact_id,
      occurred_at: r.registered_at!,
      value_cents: r.amount_due_cents ?? eventFees.get(r.moja_epr_id) ?? null,
      external_ref: `ins:${r.moja_ins_id}:${r.contact_id}`,
    }));

  const touched = new Set([...contactIdByFft.values()]);
  const identities = [...contactIdByFft.entries()].map(([fft, contact_id]) => ({ contact_id, external_id: String(fft) }));
  const consentCandidates: MojaIngestPlan["consentCandidates"] = [];
  for (const id of touched) {
    const c = byId.get(id)!;
    if (c.email) consentCandidates.push({ contact_id: id, channel: "email" });
    if (c.phone) consentCandidates.push({ contact_id: id, channel: "sms" });
  }

  const uniqueEvents = [...new Map(events.map((e) => [e.moja_epr_id, e])).values()];
  const fillSnapshots = uniqueEvents.filter((e) => e.registered_count !== null).map((e) => ({ moja_epr_id: e.moja_epr_id, registered_count: e.registered_count! }));

  return {
    tournaments,
    events: uniqueEvents,
    contactsToInsert: [...created].map((id) => byId.get(id)!),
    contactsToUpdate: [...updated].map((id) => byId.get(id)!),
    identities,
    registrations: keptRegs,
    conversions,
    availabilities,
    fillSnapshots,
    consentCandidates,
    warnings,
    counts: {
      tournaments: tournaments.length,
      events: uniqueEvents.length,
      contacts_created: created.size,
      contacts_updated: updated.size,
      registrations: keptRegs.length,
      waiting_list: keptRegs.filter((r) => r.status === "waiting_list").length,
      unknown_status: keptRegs.filter((r) => r.status === "other").length,
      conversions: conversions.length,
      availabilities: availabilities.length,
    },
  };
}
