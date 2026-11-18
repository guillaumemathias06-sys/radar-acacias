import { cleanName, eurosToCents, normalizeEmail, normalizePhone, parisLocalToIso, titleCase } from "@/lib/contacts/normalize";
import { normalizePadelCategory } from "@/lib/tournaments/segments";
import type { MojaDisponibilite, MojaEpreuve, MojaHomologation, MojaJoueur } from "./schemas";

/**
 * Transformation pure des réponses Moja vers les lignes Radar. Aucun
 * accès réseau ni base ici : tout est testable sur des données figées.
 */

export interface TournamentRow {
  moja_hom_id: number;
  code: string;
  label: string;
  type_code: string | null;
  category_code: string | null;
  season: number | null;
  starts_on: string | null;
  ends_on: string | null;
  ja_status: string | null;
  league_status: string | null;
  registered_count: number | null;
  players_count: number | null;
  events_count: number | null;
  online_registration: boolean | null;
  raw: unknown;
}

export function toTournamentRow(h: MojaHomologation): TournamentRow {
  return {
    moja_hom_id: h.homId,
    code: h.code.trim(),
    label: cleanName(h.libelle) ?? h.code,
    type_code: h.typeCode ?? (h.code.trim().charAt(0) || null),
    category_code: h.codeCategorie ?? null,
    season: h.millesime ?? null,
    starts_on: h.dateDebut?.slice(0, 10) ?? null,
    ends_on: h.dateFin?.slice(0, 10) ?? null,
    ja_status: h.statutValidationJA ?? null,
    league_status: h.statutValidationLigue ?? null,
    registered_count: h.nbInscrit ?? null,
    players_count: h.nbJoueurs ?? null,
    events_count: h.nbEpreuves ?? null,
    online_registration: h.inscriptionEnLigne ?? null,
    raw: h,
  };
}

export interface EventRow {
  moja_epr_id: number;
  label: string;
  nature: string | null;
  age_category: string | null;
  padel_category: string | null;
  rank_min: string | null;
  rank_max: string | null;
  age_min: number | null;
  age_max: number | null;
  fee_adult_cents: number | null;
  fee_junior_cents: number | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  registered_count: number | null;
  starts_on: string | null;
  ends_on: string | null;
  raw: unknown;
}

export function toEventRow(e: MojaEpreuve): EventRow {
  return {
    moja_epr_id: e.eprId,
    label: cleanName(e.libelle) ?? String(e.eprId),
    nature: e.natureCategorieEpreuve ?? null,
    age_category: e.libelleCategorieAge ?? null,
    padel_category: normalizePadelCategory(e.categorie),
    rank_min: cleanName(e.classementMin),
    rank_max: cleanName(e.classementMax),
    age_min: e.ageMin ?? null,
    age_max: e.ageMax ?? null,
    fee_adult_cents: eurosToCents(e.tarifAdulte),
    fee_junior_cents: eurosToCents(e.tarifJeune),
    registration_opens_at: parisLocalToIso(e.dateOuvertureInscriptions),
    registration_closes_at: parisLocalToIso(e.dateClotureInscriptions),
    registered_count: e.nbInscrits ?? null,
    starts_on: e.dateDebut?.slice(0, 10) ?? null,
    ends_on: e.dateFin?.slice(0, 10) ?? null,
    raw: e,
  };
}

/**
 * Statut d'inscription Moja → statut Radar. Seul « PAR » (participant)
 * est confirmé sur des données réelles ; la liste d'attente existe dans
 * l'interface mais son code n'a pas encore été observé. Tout code inconnu
 * est donc classé « other » et gardé brut (status_code) — jamais deviné
 * en participant, pour ne pas compter de fausses conversions.
 */
export function toRegistrationStatus(code: string | null | undefined): "participant" | "waiting_list" | "not_participant" | "other" {
  const c = (code ?? "").trim().toUpperCase();
  if (c === "PAR" || c === "PARTICIPANT") return "participant";
  if (c === "ATT" || c === "LAT" || c.includes("ATTENTE")) return "waiting_list";
  // NPA : inscrit mais n'a pas joué (non retenu, désinscrit ou forfait) — voir migration 003.
  if (c === "NPA") return "not_participant";
  return "other";
}

export interface ContactFromMoja {
  fft_crm_id: number;
  moja_player_id: number | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  gender: "M" | "F" | null;
  sporting_age: number | null;
  home_club_code: string | null;
  home_club_name: string | null;
  padel_rank: number | null;
  tennis_rank: string | null;
}

const UNAVAILABLE = new Set(["", "INDISPONIBLE", "NC?"]);

function usefulRank(raw: string | null | undefined): string | null {
  const value = cleanName(raw);
  if (!value || UNAVAILABLE.has(value.toUpperCase())) return null;
  return value;
}

export function toContact(j: MojaJoueur): ContactFromMoja {
  const gender = j.sexe === "1" ? "M" : j.sexe === "2" ? "F" : null;
  return {
    fft_crm_id: j.idCrm,
    moja_player_id: j.jouId ?? null,
    first_name: titleCase(j.prenom),
    last_name: cleanName(j.nom)?.toUpperCase() ?? null,
    email: normalizeEmail(j.mail),
    phone: normalizePhone(j.numTel),
    gender,
    sporting_age: j.ageSportif ?? null,
    home_club_code: cleanName(j.clubCode),
    home_club_name: cleanName(j.clubLibelle),
    padel_rank: j.classementPadel && j.classementPadel > 0 ? j.classementPadel : null,
    tennis_rank: usefulRank(j.classementSimpleUpdated) ?? usefulRank(j.meilleurClassement),
  };
}

export interface RegistrationFromMoja {
  fft_crm_id: number;
  moja_epr_id: number;
  moja_ins_id: number;
  status_code: string;
  status: "participant" | "waiting_list" | "not_participant" | "other";
  registered_at: string | null;
  amount_due_cents: number | null;
  amount_paid_cents: number | null;
}

/**
 * Moja donne les montants au niveau du joueur pour tout le tournoi, pas
 * par épreuve. On les rattache à l'épreuve seulement quand le joueur n'en
 * joue qu'une (cas de loin le plus fréquent) ; sinon on ne les répartit
 * pas au hasard : ils restent vides.
 */
export function toRegistrations(j: MojaJoueur): RegistrationFromMoja[] {
  const epreuves = j.epreuves ?? [];
  const single = epreuves.length === 1;
  return epreuves.map((e) => ({
    fft_crm_id: j.idCrm,
    moja_epr_id: e.eprId,
    // Sans numéro Moja, clé stable de remplacement : -eprId (unique avec contact_id).
    moja_ins_id: e.insId ?? -e.eprId,
    status_code: (e.statutInscriptionCode ?? "").trim() || "?",
    status: toRegistrationStatus(e.statutInscriptionCode),
    registered_at: parisLocalToIso(e.dateInscription),
    amount_due_cents: single ? eurosToCents(j.montantDu) : null,
    amount_paid_cents: single ? eurosToCents(j.montantPaye) : null,
  }));
}

export interface AvailabilityFromMoja {
  moja_player_id: number;
  general: { day: number; slots: { from: string; to: string; available: boolean }[] }[];
  specific: unknown[];
  updated_on: string | null;
}

export function toAvailability(d: MojaDisponibilite): AvailabilityFromMoja {
  const general = (d.disponibilitesGenerales ?? [])
    .map((day) => ({
      day: day.jourNumber,
      slots: (day.list ?? []).map((s) => ({ from: s.debut.slice(0, 5), to: s.fin.slice(0, 5), available: s.disponible !== false })),
    }))
    .sort((a, b) => a.day - b.day);
  return { moja_player_id: d.jouId, general, specific: d.disponibilitesParticulieres ?? [], updated_on: d.dateModification?.slice(0, 10) ?? null };
}
