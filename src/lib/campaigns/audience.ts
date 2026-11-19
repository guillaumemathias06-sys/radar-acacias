/**
 * Audience d'une relance tournoi — logique pure, testée.
 *
 * Pour une épreuve de padel cible (ex. P50 Double Messieurs), on retient les
 * joueurs qui ont déjà joué une épreuve de padel compatible :
 *   - même nature (DM pour DM, DD pour DD) ou mixte (DX) avec le bon genre ;
 *   - niveau « proche » : catégorie cible ± 1 cran (P25 / P50 / P100 pour un
 *     P50) ; « inferieur » : la catégorie cible et en dessous (P25 / P50 pour
 *     un P50) ; ou « tout le padel » si on veut ratisser large.
 * Sont exclus : les inscrits à l'épreuve cible (quel que soit leur statut),
 * les refus de consentement e-mail, les e-mails désinscrits, les fiches
 * sans e-mail. Un e-mail partagé (famille) n'apparaît qu'une fois.
 */
import { PADEL_CATEGORIES, normalizePadelCategory } from "@/lib/tournaments/segments";

export type AudienceScope = "proche" | "inferieur" | "tout";

export interface AudienceTarget {
  eventId: string;
  nature: string | null;
  padelCategory: string | null;
}

export interface PastRegistration {
  contactId: string;
  eventId: string;
  nature: string | null;
  padelCategory: string | null;
}

export interface AudienceContact {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
}

export interface AudienceMember {
  email: string;
  firstName: string | null;
  lastName: string | null;
  contactIds: string[];
}

const GENDER_OF_NATURE: Record<string, "M" | "F"> = { DM: "M", SM: "M", DD: "F", SD: "F" };

function categoryIndex(cat: string | null): number {
  const c = normalizePadelCategory(cat);
  return c ? (PADEL_CATEGORIES as readonly string[]).indexOf(c) : -1;
}

export function buildAudience(
  target: AudienceTarget,
  registrations: PastRegistration[],
  contacts: AudienceContact[],
  opts: { scope: AudienceScope; deniedContactIds: Set<string>; suppressedEmails: Set<string> },
): { members: AudienceMember[]; counts: Record<string, number> } {
  const targetIdx = categoryIndex(target.padelCategory);
  const gender = target.nature ? GENDER_OF_NATURE[target.nature] : undefined;
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  const alreadyIn = new Set(registrations.filter((r) => r.eventId === target.eventId).map((r) => r.contactId));
  const eligible = new Set<string>();
  for (const r of registrations) {
    if (r.eventId === target.eventId || !r.padelCategory) continue;
    const c = contactById.get(r.contactId);
    if (!c) continue;
    const sameNature = r.nature === target.nature;
    const mixedOk = r.nature === "DX" && gender !== undefined && c.gender === gender;
    if (!sameNature && !mixedOk) continue;
    if (opts.scope !== "tout" && targetIdx >= 0) {
      const idx = categoryIndex(r.padelCategory);
      if (idx < 0) continue;
      if (opts.scope === "proche" && Math.abs(idx - targetIdx) > 1) continue;
      if (opts.scope === "inferieur" && idx > targetIdx) continue;
    }
    eligible.add(r.contactId);
  }

  const counts = { joueurs_compatibles: eligible.size, deja_inscrits: 0, sans_email: 0, refus: 0, desinscrits: 0, emails_partages: 0 };
  const byEmail = new Map<string, AudienceMember>();
  for (const id of eligible) {
    if (alreadyIn.has(id)) { counts.deja_inscrits++; continue; }
    const c = contactById.get(id)!;
    const email = c.email?.trim().toLowerCase();
    if (!email) { counts.sans_email++; continue; }
    if (opts.deniedContactIds.has(id)) { counts.refus++; continue; }
    if (opts.suppressedEmails.has(email)) { counts.desinscrits++; continue; }
    const existing = byEmail.get(email);
    if (existing) { existing.contactIds.push(id); counts.emails_partages++; continue; }
    byEmail.set(email, { email, firstName: c.first_name, lastName: c.last_name, contactIds: [id] });
  }
  // Un e-mail partagé dont l'un des titulaires est déjà inscrit : on ne relance pas ce foyer.
  const inEmails = new Set([...alreadyIn].map((id) => contactById.get(id)?.email?.trim().toLowerCase()).filter(Boolean));
  for (const email of inEmails) if (byEmail.delete(email as string)) counts.deja_inscrits++;

  const members = [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
  return { members, counts: { ...counts, audience: members.length } };
}
