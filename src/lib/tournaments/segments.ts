/**
 * Segments de tournois — logique pure, testée.
 *
 * Padel : la catégorie FFT (P25 … P2000) est le segment.
 * Tennis : le segment est la plage de classements de l'épreuve, rattachée
 * aux séries FFT (4e : 40 → 30/1, 3e : 30 → 15/1, 2e : 15 → -30, 1re :
 * numérotés). « NC → N1 » (aucune limite) est un Open.
 */

export const PADEL_CATEGORIES = ["P25", "P50", "P100", "P250", "P500", "P1000", "P2000"] as const;

/** « p 100 », « P100 », « 100 » → « P100 » ; une valeur hors échelle est gardée telle quelle. */
export function normalizePadelCategory(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text) return null;
  const m = /^P?\s*(\d+)$/i.exec(text);
  if (m && (PADEL_CATEGORIES as readonly string[]).includes(`P${m[1]}`)) return `P${m[1]}`;
  return text.toUpperCase();
}

/** Échelle des classements tennis FFT, du plus faible au plus fort. */
const TENNIS_RANKS = ["NC", "40", "30/5", "30/4", "30/3", "30/2", "30/1", "30", "15/5", "15/4", "15/3", "15/2", "15/1", "15", "5/6", "4/6", "3/6", "2/6", "1/6", "0", "-2/6", "-4/6", "-15", "-30"];

type Series = "4e série" | "3e série" | "2e série" | "1re série";

function seriesOf(rank: string): Series | null {
  const r = rank.trim().toUpperCase();
  const i = TENNIS_RANKS.indexOf(r);
  if (i >= 0) {
    if (i <= TENNIS_RANKS.indexOf("30/1")) return "4e série";
    if (i <= TENNIS_RANKS.indexOf("15/1")) return "3e série";
    return "2e série";
  }
  if (/^(N\d*|-?\d+E?)$/.test(r) || /^T\d+$/.test(r)) return "1re série"; // numérotés / top
  return null;
}

/** Libellé lisible du segment tennis, ex. « 4e série (30/4 → 30/1) », « Open (NC → N1) ». */
export function tennisSegment(rankMin: string | null | undefined, rankMax: string | null | undefined): string | null {
  const min = rankMin?.trim().toUpperCase() || null;
  const max = rankMax?.trim().toUpperCase() || null;
  if (!min && !max) return null;
  const range = `${min ?? "?"} → ${max ?? "?"}`;
  if ((min === "NC" || min === "40") && max && seriesOf(max) === "1re série") return `Open (${range})`;
  const a = min ? seriesOf(min) : null;
  const b = max ? seriesOf(max) : null;
  if (a && b && a !== b) return `${a.replace(" série", "")} → ${b} (${range})`;
  if (a ?? b) return `${a ?? b} (${range})`;
  return range;
}

export interface SegmentInput {
  padelCategory: string | null;
  nature: string | null;
  ageCategory: string | null;
  rankMin?: string | null;
  rankMax?: string | null;
}

/** Discipline et segment affichables d'une épreuve. */
export function eventSegment(e: SegmentInput): { discipline: "padel" | "tennis"; segment: string } {
  if (e.padelCategory) return { discipline: "padel", segment: normalizePadelCategory(e.padelCategory) ?? e.padelCategory };
  const parts = [tennisSegment(e.rankMin, e.rankMax), e.ageCategory && e.ageCategory !== "Senior" ? e.ageCategory : null].filter(Boolean);
  return { discipline: "tennis", segment: parts.join(" · ") || "Tennis" };
}
