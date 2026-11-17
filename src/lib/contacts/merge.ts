/**
 * Rapprochement et fusion des fiches contacts, en mémoire et sans accès
 * base. Ordre de confiance pour reconnaître une même personne :
 * identifiant FFT > e-mail > téléphone + nom de famille. Le téléphone
 * seul ne suffit jamais : un parent inscrit souvent ses enfants avec
 * son propre numéro.
 */

export interface ContactRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  fft_crm_id: number | null;
  gender: "M" | "F" | null;
  sporting_age: number | null;
  home_club_code: string | null;
  home_club_name: string | null;
  padel_rank: number | null;
  tennis_rank: string | null;
  first_seen_at: string | null;
  last_activity_at: string | null;
}

export type IncomingContact = Omit<ContactRecord, "id" | "first_seen_at" | "last_activity_at"> & {
  first_seen_at?: string | null;
  last_activity_at?: string | null;
};

export class ContactIndex {
  private byFft = new Map<number, ContactRecord>();
  private byEmail = new Map<string, ContactRecord>();
  private byPhoneName = new Map<string, ContactRecord>();

  constructor(records: ContactRecord[] = []) {
    for (const r of records) this.add(r);
  }

  add(record: ContactRecord): void {
    if (record.fft_crm_id !== null) this.byFft.set(record.fft_crm_id, record);
    if (record.email) this.byEmail.set(record.email, record);
    const key = phoneNameKey(record.phone, record.last_name);
    if (key) this.byPhoneName.set(key, record);
  }

  find(incoming: Pick<IncomingContact, "fft_crm_id" | "email" | "phone" | "last_name">): ContactRecord | null {
    if (incoming.fft_crm_id !== null) {
      const hit = this.byFft.get(incoming.fft_crm_id);
      if (hit) return hit;
    }
    if (incoming.email) {
      const hit = this.byEmail.get(incoming.email);
      // Même e-mail mais autre licencié FFT : ce n'est pas la même
      // personne (adresse familiale partagée). On ne fusionne pas.
      if (hit && (hit.fft_crm_id === null || incoming.fft_crm_id === null || hit.fft_crm_id === incoming.fft_crm_id)) return hit;
    }
    const key = phoneNameKey(incoming.phone, incoming.last_name);
    if (key) {
      const hit = this.byPhoneName.get(key);
      if (hit && (hit.fft_crm_id === null || incoming.fft_crm_id === null || hit.fft_crm_id === incoming.fft_crm_id)) return hit;
    }
    return null;
  }
}

function phoneNameKey(phone: string | null, lastName: string | null): string | null {
  if (!phone || !lastName) return null;
  return `${phone}|${lastName.toUpperCase()}`;
}

/**
 * Fusion : on complète les champs vides ; pour les données qui évoluent
 * (classements, âge, club), la source la plus récente l'emporte. On ne
 * remplace jamais une valeur connue par une valeur vide.
 */
export function mergeContact(existing: ContactRecord, incoming: IncomingContact): { merged: ContactRecord; changed: boolean } {
  const pick = <T>(current: T | null, next: T | null | undefined, preferNext: boolean): T | null => {
    if (next === null || next === undefined) return current;
    if (current === null || current === undefined) return next;
    return preferNext ? next : current;
  };
  const merged: ContactRecord = {
    ...existing,
    first_name: pick(existing.first_name, incoming.first_name, false),
    last_name: pick(existing.last_name, incoming.last_name, false),
    email: pick(existing.email, incoming.email, false),
    phone: pick(existing.phone, incoming.phone, false),
    fft_crm_id: pick(existing.fft_crm_id, incoming.fft_crm_id, false),
    gender: pick(existing.gender, incoming.gender, false),
    sporting_age: pick(existing.sporting_age, incoming.sporting_age, true),
    home_club_code: pick(existing.home_club_code, incoming.home_club_code, true),
    home_club_name: pick(existing.home_club_name, incoming.home_club_name, true),
    padel_rank: pick(existing.padel_rank, incoming.padel_rank, true),
    tennis_rank: pick(existing.tennis_rank, incoming.tennis_rank, true),
    first_seen_at: minIso(existing.first_seen_at, incoming.first_seen_at ?? null),
    last_activity_at: maxIso(existing.last_activity_at, incoming.last_activity_at ?? null),
  };
  const changed = (Object.keys(merged) as (keyof ContactRecord)[]).some((k) => merged[k] !== existing[k]);
  return { merged, changed };
}

export function minIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) <= new Date(b) ? a : b;
}

export function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) >= new Date(b) ? a : b;
}
