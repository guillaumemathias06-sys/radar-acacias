/**
 * Alertes de remplissage des tournois — logique pure, testée.
 *
 * Pour chaque épreuve à venir, on compare le nombre d'inscrits actuel à
 * une référence : la moyenne finale des épreuves passées comparables
 * (même catégorie padel, ou même nature + âge + plage de classements en tennis).
 * Sans historique comparable, on n'invente pas de référence : seules les
 * règles absolues (0 inscrit à l'approche) s'appliquent.
 */

export interface FillEvent {
  id: string;
  label: string;
  tournamentLabel: string;
  nature: string | null;
  ageCategory: string | null;
  padelCategory: string | null;
  rankMin?: string | null;
  rankMax?: string | null;
  startsOn: string | null;
  registeredCount: number;
}

export type FillLevel = "critical" | "warning" | "ok" | "unknown";

export interface FillStatus {
  event: FillEvent;
  daysLeft: number;
  reference: number | null;
  ratio: number | null;
  level: FillLevel;
  reason: string;
}

export function comparableKey(e: Pick<FillEvent, "nature" | "ageCategory" | "padelCategory" | "rankMin" | "rankMax">): string {
  if (e.padelCategory) return `padel:${e.padelCategory}:${e.nature ?? ""}`;
  // Tennis : même nature, même âge ET même plage de classements (un TMC 30/4-30/1 ne se compare pas à un Open).
  return `tennis:${e.nature ?? ""}:${e.ageCategory ?? ""}:${e.rankMin ?? ""}-${e.rankMax ?? ""}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** Moyenne finale des épreuves passées comparables (au moins 2 pour être une référence). */
export function buildReferences(past: FillEvent[], today: string): Map<string, number> {
  const groups = new Map<string, number[]>();
  for (const e of past) {
    if (!e.startsOn || e.startsOn >= today || e.registeredCount <= 0) continue;
    const key = comparableKey(e);
    groups.set(key, [...(groups.get(key) ?? []), e.registeredCount]);
  }
  const refs = new Map<string, number>();
  for (const [key, values] of groups) {
    if (values.length >= 2) refs.set(key, values.reduce((a, b) => a + b, 0) / values.length);
  }
  return refs;
}

/**
 * Courbe d'inscription attendue : la plupart des inscriptions arrivent
 * dans les 3 dernières semaines. Part de la référence attendue à J-n.
 */
export function expectedShare(daysLeft: number): number {
  if (daysLeft <= 2) return 0.9;
  if (daysLeft <= 7) return 0.6;
  if (daysLeft <= 14) return 0.4;
  if (daysLeft <= 21) return 0.25;
  if (daysLeft <= 35) return 0.1;
  return 0;
}

export function assessFill(event: FillEvent, references: Map<string, number>, today: string): FillStatus {
  const daysLeft = event.startsOn ? daysBetween(today, event.startsOn) : Number.POSITIVE_INFINITY;
  const reference = references.get(comparableKey(event)) ?? null;
  const ratio = reference ? event.registeredCount / reference : null;

  if (event.registeredCount === 0 && daysLeft <= 21) {
    return { event, daysLeft, reference, ratio, level: "critical", reason: `0 inscrit à J-${daysLeft}` };
  }
  if (reference === null) {
    if (event.registeredCount === 0 && daysLeft <= 35) return { event, daysLeft, reference, ratio, level: "warning", reason: `0 inscrit à J-${daysLeft}` };
    return { event, daysLeft, reference, ratio, level: "unknown", reason: "Pas encore d'historique comparable" };
  }
  const expected = reference * expectedShare(daysLeft);
  if (expected === 0) return { event, daysLeft, reference, ratio, level: "ok", reason: "Trop tôt pour juger" };
  const pace = event.registeredCount / expected;
  const refText = `réf. ${Math.round(reference)} inscrits en moyenne`;
  // Au-delà de 3 semaines, un retard reste rattrapable : « à surveiller » au plus.
  if (pace < 0.5 && daysLeft > 21) return { event, daysLeft, reference, ratio, level: "warning", reason: `${event.registeredCount} inscrit(s) à J-${daysLeft}, attendu ≈ ${Math.round(expected)} (${refText})` };
  if (pace < 0.5) return { event, daysLeft, reference, ratio, level: "critical", reason: `${event.registeredCount} inscrit(s) à J-${daysLeft}, attendu ≈ ${Math.round(expected)} (${refText})` };
  if (pace < 0.8) return { event, daysLeft, reference, ratio, level: "warning", reason: `${event.registeredCount} inscrit(s) à J-${daysLeft}, attendu ≈ ${Math.round(expected)} (${refText})` };
  return { event, daysLeft, reference, ratio, level: "ok", reason: `Dans le rythme (${refText})` };
}

const LEVEL_ORDER: Record<FillLevel, number> = { critical: 0, warning: 1, unknown: 2, ok: 3 };

export function assessUpcoming(all: FillEvent[], today: string): FillStatus[] {
  const refs = buildReferences(all, today);
  return all
    .filter((e) => e.startsOn && e.startsOn >= today)
    .map((e) => assessFill(e, refs, today))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.daysLeft - b.daysLeft);
}
