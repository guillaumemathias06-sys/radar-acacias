import { describe, expect, it } from "vitest";
import { planMojaIngest } from "./plan";
import { toRegistrationStatus } from "./normalize";
import type { ContactRecord } from "@/lib/contacts/merge";
import { normalizePhone, parisLocalToIso } from "@/lib/contacts/normalize";

// Données fictives, mêmes formes que les vraies réponses Moja du 17/11/2026.
const homologation = {
  homId: 294005,
  libelle: "P100 HOMMES - TC ACACIAS",
  code: "P 2027 62 06 0315 00294005",
  dateDebut: "2026-11-22",
  dateFin: "2026-11-22",
  statutValidationJA: "ACCEPTE",
  statutValidationLigue: "VALIDE",
  millesime: 2027,
  inscriptionEnLigne: true,
  codeCategorie: null,
  codeClub: "62060315",
  nbInscrit: 4,
  nbJoueurs: 4,
  nbEpreuves: 1,
  typeCode: "P",
};

const epreuve = {
  eprId: 678986,
  libelle: "Double Messieurs Senior",
  natureCategorieEpreuve: "DM",
  libelleCategorieAge: "Senior",
  categorie: "P100",
  classementMin: "",
  classementMax: "",
  ageMin: 19,
  ageMax: 44,
  tarifAdulte: 20.0,
  tarifJeune: 20.0,
  dateOuvertureInscriptions: "2026-11-01T10:00:00",
  dateClotureInscriptions: "2026-11-21T23:59:00",
  dateDebut: "2026-11-22",
  dateFin: "2026-11-22",
  nbInscrits: 4,
};

function joueur(idCrm: number, jouId: number, prenom: string, nom: string, mail: string | null, tel: string | null, insId: number, code = "PAR") {
  return {
    idCrm,
    jouId,
    prenom,
    nom,
    mail,
    numTel: tel,
    sexe: "1",
    ageSportif: 30,
    clubCode: "62060315",
    clubLibelle: "TC ACACIAS",
    classementPadel: 12000,
    meilleurClassement: "Indisponible",
    classementSimpleUpdated: "Indisponible",
    montantPaye: 0,
    montantDu: 20,
    epreuves: [{ eprId: 678986, insId, statutInscriptionCode: code, dateInscription: "2026-11-04T10:57:31.80092" }],
  };
}

const dispo = {
  jouId: 1,
  disponibilitesGenerales: [
    { idCrm: 101, jourNumber: 6, list: [{ id: 1, debut: "08:00:00", fin: "22:00:00", disponible: true }] },
    { idCrm: 101, jourNumber: 1, list: [{ id: 2, debut: "18:00:00", fin: "22:00:00", disponible: true }] },
  ],
  disponibilitesParticulieres: [],
  dateModification: "2026-11-15",
};

function snapshot(joueurs: unknown[]) {
  return {
    collectedAt: "2026-11-17T06:00:00Z",
    homologations: [homologation],
    details: { "294005": { epreuves: [epreuve], joueurs, disponibilites: [dispo] } },
  };
}

let seq = 0;
const newId = () => `new-${++seq}`;

describe("planMojaIngest", () => {
  it("crée tournoi, épreuve, contacts, inscriptions, conversions et disponibilités", () => {
    seq = 0;
    const plan = planMojaIngest(
      snapshot([
        joueur(101, 1, "hugo", "martin", "Hugo.Martin@Example.com", "06 12 34 56 78", 5001),
        joueur(102, 2, "louis", "durand", null, "+33611111111", 5001),
      ]),
      [],
      { today: "2026-11-17", newId },
    );
    expect(plan.warnings).toEqual([]);
    expect(plan.tournaments[0]).toMatchObject({ moja_hom_id: 294005, type_code: "P", season: 2027, starts_on: "2026-11-22" });
    expect(plan.events[0]).toMatchObject({ moja_hom_id: 294005, padel_category: "P100", fee_adult_cents: 2000, rank_min: null });
    expect(plan.contactsToInsert).toHaveLength(2);
    expect(plan.contactsToInsert[0]).toMatchObject({ first_name: "Hugo", last_name: "MARTIN", email: "hugo.martin@example.com", phone: "+33612345678", tennis_rank: null });
    expect(plan.registrations).toHaveLength(2);
    expect(plan.conversions).toHaveLength(2);
    expect(plan.conversions[0].value_cents).toBe(2000);
    expect(plan.availabilities).toHaveLength(1);
    expect((plan.availabilities[0].general as { day: number }[]).map((d) => d.day)).toEqual([1, 6]);
    // Tournoi pas encore joué : la dernière activité est la date d'inscription.
    expect(plan.contactsToInsert[0].last_activity_at).toBe(plan.contactsToInsert[0].first_seen_at);
    expect(plan.consentCandidates).toEqual([
      { contact_id: "new-1", channel: "email" },
      { contact_id: "new-1", channel: "sms" },
      { contact_id: "new-2", channel: "sms" },
    ]);
  });

  it("reconnaît un contact existant par son identifiant FFT et ne met à jour que ce qui change", () => {
    const existing: ContactRecord = {
      id: "c-1",
      first_name: "Hugo",
      last_name: "MARTIN",
      email: "hugo.martin@example.com",
      phone: null,
      fft_crm_id: 101,
      gender: "M",
      sporting_age: 29,
      home_club_code: "62060315",
      home_club_name: "TC ACACIAS",
      padel_rank: 15000,
      tennis_rank: null,
      first_seen_at: "2025-01-01T00:00:00.000Z",
      last_activity_at: "2025-06-01T00:00:00.000Z",
    };
    const plan = planMojaIngest(snapshot([joueur(101, 1, "Hugo", "Martin", null, "0612345678", 5001)]), [existing], { today: "2026-11-17", newId });
    expect(plan.contactsToInsert).toHaveLength(0);
    expect(plan.contactsToUpdate).toHaveLength(1);
    const u = plan.contactsToUpdate[0];
    expect(u.email).toBe("hugo.martin@example.com"); // jamais effacé par une valeur vide
    expect(u.phone).toBe("+33612345678"); // complété
    expect(u.padel_rank).toBe(12000); // classement : le plus récent l'emporte
    expect(u.first_seen_at).toBe("2025-01-01T00:00:00.000Z"); // la plus ancienne date reste
    expect(plan.registrations[0].contact_id).toBe("c-1");
  });

  it("ne fusionne pas deux licenciés différents qui partagent l'e-mail familial", () => {
    seq = 0;
    const plan = planMojaIngest(
      snapshot([
        joueur(201, 1, "Paul", "Petit", "famille@example.com", null, 6001),
        joueur(202, 2, "Léa", "Petit", "famille@example.com", null, 6001),
      ]),
      [],
      { today: "2026-11-17", newId },
    );
    expect(plan.contactsToInsert).toHaveLength(2);
  });

  it("ne compte pas la liste d'attente ni un statut inconnu comme conversion", () => {
    seq = 0;
    const plan = planMojaIngest(
      snapshot([joueur(301, 1, "A", "Un", null, null, 7001, "ATT"), joueur(302, 2, "B", "Deux", null, null, 7002, "XYZ")]),
      [],
      { today: "2026-11-17", newId },
    );
    expect(plan.counts.waiting_list).toBe(1);
    expect(plan.counts.unknown_status).toBe(1);
    expect(plan.conversions).toHaveLength(0);
  });

  it("garde les entrées valides et signale celles qui sont illisibles", () => {
    const plan = planMojaIngest(snapshot([{ pasUnJoueur: true }, joueur(401, 1, "C", "Trois", null, null, 8001)]), [], { today: "2026-11-17", newId });
    expect(plan.registrations).toHaveLength(1);
    expect(plan.warnings[0]).toContain("1 joueur(s) illisible(s)");
  });
});

describe("normalisation", () => {
  it("statuts d'inscription", () => {
    expect(toRegistrationStatus("PAR")).toBe("participant");
    expect(toRegistrationStatus("ATT")).toBe("waiting_list");
    expect(toRegistrationStatus(null)).toBe("other");
  });

  it("téléphones", () => {
    expect(normalizePhone("06 72 34 16 31")).toBe("+33672341631");
    expect(normalizePhone("+33629794933")).toBe("+33629794933");
    expect(normalizePhone("0033612345678")).toBe("+33612345678");
    expect(normalizePhone("12")).toBeNull();
  });

  it("dates Moja en heure de Paris (hiver et été)", () => {
    expect(parisLocalToIso("2026-11-04T10:57:31.80092")).toBe("2026-11-04T09:57:31.000Z");
    expect(parisLocalToIso("2026-07-04T10:00:00")).toBe("2026-07-04T08:00:00.000Z");
    expect(parisLocalToIso("2026-11-22")).toBe("2026-11-21T23:00:00.000Z");
  });

  it("écarte les tournois d'autres clubs et ceux refusés par la Ligue", () => {
    const autreClub = { ...homologation, homId: 13519, codeClub: "52290161" };
    const refuse = { ...homologation, homId: 13520, statutValidationLigue: "REFUSE" };
    const plan = planMojaIngest(
      {
        collectedAt: "2026-11-17T06:00:00Z",
        homologations: [homologation, autreClub, refuse],
        details: {
          "294005": { epreuves: [epreuve], joueurs: [joueur(101, 1, "hugo", "martin", null, null, 5001)], disponibilites: [] },
          "13519": { epreuves: [epreuve], joueurs: [joueur(201, 1, "paul", "petit", null, null, 6001)], disponibilites: [] },
        },
      },
      [],
      { today: "2026-11-17", newId, clubCode: "62060315" },
    );
    expect(plan.tournaments.map((t) => t.moja_hom_id)).toEqual([294005]);
    expect(plan.counts.excluded_tournaments).toBe(2);
    expect(plan.counts.contacts_created).toBe(1);
    expect(plan.warnings).toEqual([]);
  });
});
