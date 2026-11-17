/** Normalisation commune à toutes les sources (Moja, Playtomic, formulaires…). */

export function normalizeEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  // Contrôle volontairement simple : on écarte seulement ce qui n'est
  // manifestement pas une adresse, sans prétendre valider la boîte.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

/** Numéros français → format international +33XXXXXXXXX. Les autres
 * numéros internationaux (+XX…) sont gardés tels quels, sans espaces. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.replace(/[\s.\-()]/g, "");
  if (!compact) return null;
  if (/^0[1-9]\d{8}$/.test(compact)) return `+33${compact.slice(1)}`;
  if (/^0033[1-9]\d{8}$/.test(compact)) return `+33${compact.slice(4)}`;
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  return null;
}

export function cleanName(raw: string | null | undefined): string | null {
  const value = raw?.trim().replace(/\s+/g, " ");
  return value ? value : null;
}

/** « DUPONT » → « Dupont », « jean-marc » → « Jean-Marc ». */
export function titleCase(raw: string | null | undefined): string | null {
  const value = cleanName(raw);
  if (!value) return null;
  return value.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

export function eurosToCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

/**
 * Moja renvoie des dates locales sans fuseau (« 2026-11-04T10:57:31.80092 »).
 * Elles sont en heure de Paris : on les convertit en ISO UTC en tenant
 * compte de l'heure d'été/hiver de la date elle-même.
 */
export function parisLocalToIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(raw);
  if (!match) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = match;
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  if (Number.isNaN(asUtc)) return null;
  const offsetMinutes = parisOffsetMinutes(new Date(asUtc));
  return new Date(asUtc - offsetMinutes * 60_000).toISOString();
}

function parisOffsetMinutes(at: Date): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(part ?? "");
  if (!m) return 60;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** Date du jour à Paris, format AAAA-MM-JJ. */
export function parisToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);
}
