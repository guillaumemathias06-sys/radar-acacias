import { z } from "zod";

/**
 * Formes réelles des réponses de l'API interne de Moja (/moja/api/spa/…),
 * relevées le 17/11/2026 sur le compte JA du club. Moja n'a pas d'API
 * publique documentée : ces schémas ne valident QUE les champs que Radar
 * lit, tout le reste passe (`passthrough`), et chaque champ optionnel
 * accepte `null` explicite (leçon Playtomic : « optionnel » veut souvent
 * dire `null`, pas absent).
 */

export const homologationSchema = z
  .object({
    homId: z.number(),
    libelle: z.string(),
    code: z.string(),
    dateDebut: z.string().nullish(),
    dateFin: z.string().nullish(),
    statutValidationJA: z.string().nullish(),
    statutValidationLigue: z.string().nullish(),
    millesime: z.number().nullish(),
    inscriptionEnLigne: z.boolean().nullish(),
    codeCategorie: z.string().nullish(),
    codeClub: z.string().nullish(),
    nbInscrit: z.number().nullish(),
    nbJoueurs: z.number().nullish(),
    nbEpreuves: z.number().nullish(),
    typeCode: z.string().nullish(),
  })
  .passthrough();
export type MojaHomologation = z.infer<typeof homologationSchema>;

export const epreuveSchema = z
  .object({
    eprId: z.number(),
    libelle: z.string(),
    natureCategorieEpreuve: z.string().nullish(),
    libelleCategorieAge: z.string().nullish(),
    categorie: z.string().nullish(),
    classementMin: z.string().nullish(),
    classementMax: z.string().nullish(),
    ageMin: z.number().nullish(),
    ageMax: z.number().nullish(),
    tarifAdulte: z.number().nullish(),
    tarifJeune: z.number().nullish(),
    dateOuvertureInscriptions: z.string().nullish(),
    dateClotureInscriptions: z.string().nullish(),
    dateDebut: z.string().nullish(),
    dateFin: z.string().nullish(),
    nbInscrits: z.number().nullish(),
  })
  .passthrough();
export type MojaEpreuve = z.infer<typeof epreuveSchema>;

export const joueurEpreuveSchema = z
  .object({
    eprId: z.number(),
    // Absent pour certaines inscriptions (observé le 18/11/2026) : le joueur reste valide.
    insId: z.number().nullish(),
    statutInscriptionCode: z.string().nullish(),
    dateInscription: z.string().nullish(),
  })
  .passthrough();

export const joueurSchema = z
  .object({
    idCrm: z.number(),
    jouId: z.number().nullish(),
    prenom: z.string().nullish(),
    nom: z.string().nullish(),
    mail: z.string().nullish(),
    numTel: z.string().nullish(),
    sexe: z.string().nullish(),
    ageSportif: z.number().nullish(),
    clubCode: z.string().nullish(),
    clubLibelle: z.string().nullish(),
    classementPadel: z.number().nullish(),
    meilleurClassement: z.string().nullish(),
    classementSimpleUpdated: z.string().nullish(),
    montantPaye: z.number().nullish(),
    montantDu: z.number().nullish(),
    epreuves: z.array(joueurEpreuveSchema).nullish(),
  })
  .passthrough();
export type MojaJoueur = z.infer<typeof joueurSchema>;

const creneauSchema = z.object({ debut: z.string(), fin: z.string(), disponible: z.boolean().nullish() }).passthrough();

export const disponibiliteSchema = z
  .object({
    jouId: z.number(),
    disponibilitesGenerales: z
      .array(
        z
          .object({
            idCrm: z.number().nullish(),
            jourNumber: z.number(),
            list: z.array(creneauSchema).nullish(),
          })
          .passthrough(),
      )
      .nullish(),
    disponibilitesParticulieres: z.array(z.unknown()).nullish(),
    dateModification: z.string().nullish(),
  })
  .passthrough();
export type MojaDisponibilite = z.infer<typeof disponibiliteSchema>;

/** Ce que le collecteur local envoie à Radar : les réponses brutes de Moja. */
export const mojaSnapshotSchema = z.object({
  collectedAt: z.string(),
  homologations: z.array(z.unknown()),
  details: z.record(
    z.string(),
    z.object({
      epreuves: z.array(z.unknown()),
      joueurs: z.array(z.unknown()),
      disponibilites: z.array(z.unknown()),
    }),
  ),
});
export type MojaSnapshot = z.infer<typeof mojaSnapshotSchema>;

export function safeParseList<T>(schema: z.ZodType<T>, raw: unknown[]): { items: T[]; skipped: number; firstIssue?: string } {
  const items: T[] = [];
  let skipped = 0;
  let firstIssue: string | undefined;
  for (const entry of raw) {
    const result = schema.safeParse(entry);
    if (result.success) items.push(result.data);
    else {
      skipped++;
      if (!firstIssue) firstIssue = result.error.issues.map((i) => `${i.path.join(".") || "(racine)"}: ${i.message}`).join(" ; ");
    }
  }
  return { items, skipped, firstIssue };
}
