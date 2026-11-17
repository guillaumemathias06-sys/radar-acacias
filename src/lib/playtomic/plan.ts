import { ContactIndex, mergeContact, type ContactRecord } from "@/lib/contacts/merge";
import { cleanName, normalizeEmail } from "@/lib/contacts/normalize";
import { parseMoneyString } from "./money";
import { extractParticipants } from "./participants";

/**
 * Plan d'import Playtomic, pur et testé : réservations → contacts,
 * conversions « réservation » (une par joueur) et consentements e-mail.
 *
 * Un joueur Playtomic n'est reconnu que par son identifiant Playtomic ou
 * son e-mail : Playtomic ne donne ni licence FFT ni téléphone ici.
 */

export interface PlaytomicBookingInput {
  booking_id: string;
  booking_start_date?: string | null;
  price?: string | null;
  is_canceled?: boolean | null;
  status?: string | null;
  sport_id?: string | null;
  [key: string]: unknown;
}

export interface PlaytomicIngestPlan {
  contactsToInsert: ContactRecord[];
  contactsToUpdate: ContactRecord[];
  identities: { contact_id: string; external_id: string }[];
  conversions: { contact_id: string; occurred_at: string; value_cents: number | null; external_ref: string }[];
  /** Consentement marketing explicite donné à Playtomic → « accordé ». */
  emailConsents: { contact_id: string; granted: boolean }[];
  counts: Record<string, number>;
}

/** « Jean-Marc DUPONT » → { first: "Jean-Marc", last: "DUPONT" }. Le dernier mot est pris comme nom de famille. */
export function splitName(full: string | null): { first: string | null; last: string | null } {
  const value = cleanName(full);
  if (!value) return { first: null, last: null };
  const parts = value.split(" ");
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts.slice(0, -1).join(" "), last: parts.at(-1)!.toUpperCase() };
}

export function planPlaytomicIngest(
  bookings: PlaytomicBookingInput[],
  existing: ContactRecord[],
  knownPlaytomicIds: Map<string, string>,
  options: { newId?: () => string } = {},
): PlaytomicIngestPlan {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const index = new ContactIndex(existing);
  const byId = new Map(existing.map((c) => [c.id, { ...c }]));
  const created = new Set<string>();
  const updated = new Set<string>();
  const identities = new Map<string, string>(); // playtomic id → contact id
  const consents = new Map<string, boolean>();
  const conversions: PlaytomicIngestPlan["conversions"] = [];
  let canceled = 0;

  for (const booking of bookings) {
    if (booking.is_canceled || booking.status?.toUpperCase() === "CANCELED") {
      canceled++;
      continue;
    }
    const startAt = booking.booking_start_date ?? null;
    const participants = extractParticipants(booking);
    const price = parseMoneyString(booking.price ?? null);
    const share = price && participants.length ? Math.round((price.amount * 100) / participants.length) : null;

    for (const p of participants) {
      const email = normalizeEmail(p.email);
      const { first, last } = splitName(p.name);
      let contactId = knownPlaytomicIds.get(p.participantId) ?? identities.get(p.participantId) ?? null;
      const candidate = {
        first_name: first,
        last_name: last,
        email,
        phone: null,
        fft_crm_id: null,
        gender: null,
        sporting_age: null,
        home_club_code: null,
        home_club_name: null,
        padel_rank: null,
        tennis_rank: null,
        first_seen_at: startAt,
        last_activity_at: startAt,
      };

      if (!contactId) {
        const match = email ? index.find({ fft_crm_id: null, email, phone: null, last_name: last }) : null;
        contactId = match?.id ?? null;
      }

      if (contactId && byId.has(contactId)) {
        const { merged, changed } = mergeContact(byId.get(contactId)!, candidate);
        byId.set(contactId, merged);
        index.add(merged);
        if (changed && !created.has(contactId)) updated.add(contactId);
      } else if (contactId) {
        // Identité Playtomic connue mais fiche absente du lot chargé : on ne recrée rien.
        continue;
      } else {
        contactId = newId();
        const record: ContactRecord = { id: contactId, ...candidate };
        byId.set(contactId, record);
        index.add(record);
        created.add(contactId);
      }

      identities.set(p.participantId, contactId);
      // Un « oui » explicite l'emporte ; sinon on garde ce qu'on sait déjà.
      consents.set(contactId, (consents.get(contactId) ?? false) || p.acceptsCommercial);
      if (startAt) {
        conversions.push({ contact_id: contactId, occurred_at: startAt, value_cents: share, external_ref: `booking:${booking.booking_id}:${p.participantId}` });
      }
    }
  }

  return {
    contactsToInsert: [...created].map((id) => byId.get(id)!),
    contactsToUpdate: [...updated].map((id) => byId.get(id)!),
    identities: [...identities.entries()].map(([external_id, contact_id]) => ({ contact_id, external_id })),
    conversions,
    emailConsents: [...consents.entries()].map(([contact_id, granted]) => ({ contact_id, granted })),
    counts: {
      bookings: bookings.length,
      canceled,
      contacts_created: created.size,
      contacts_updated: updated.size,
      conversions: conversions.length,
      marketing_opt_in: [...consents.values()].filter(Boolean).length,
    },
  };
}
