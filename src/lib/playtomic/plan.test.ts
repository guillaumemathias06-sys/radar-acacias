import { describe, expect, it } from "vitest";
import { planPlaytomicIngest, splitName } from "./plan";
import type { ContactRecord } from "@/lib/contacts/merge";

function booking(id: string, participants: { participant_id: string; name: string; email?: string | null; accepts_commercial_communications?: boolean | null }[], extra: Record<string, unknown> = {}) {
  return { booking_id: id, booking_start_date: "2026-11-10T18:00:00Z", price: "40.00 EUR", is_canceled: false, participant_info: { participants }, ...extra };
}

let seq = 0;
const newId = () => `p-${++seq}`;

describe("planPlaytomicIngest", () => {
  it("crée un contact par joueur, partage le prix, enregistre le consentement explicite", () => {
    seq = 0;
    const plan = planPlaytomicIngest(
      [
        booking("b1", [
          { participant_id: "u1", name: "Jean-Marc Dupont", email: "JM@example.com", accepts_commercial_communications: true },
          { participant_id: "u2", name: "Ana", email: null, accepts_commercial_communications: null },
        ]),
      ],
      [],
      new Map(),
      { newId },
    );
    expect(plan.contactsToInsert).toHaveLength(2);
    expect(plan.contactsToInsert[0]).toMatchObject({ first_name: "Jean-Marc", last_name: "DUPONT", email: "jm@example.com" });
    expect(plan.conversions.map((c) => c.value_cents)).toEqual([2000, 2000]);
    expect(plan.emailConsents).toEqual([
      { contact_id: "p-1", granted: true },
      { contact_id: "p-2", granted: false },
    ]);
  });

  it("rattache un joueur Playtomic à une fiche Moja existante par l'e-mail", () => {
    const existing: ContactRecord = {
      id: "c-moja",
      first_name: "Hugo",
      last_name: "MARTIN",
      email: "hugo@example.com",
      phone: "+33612345678",
      fft_crm_id: 101,
      gender: "M",
      sporting_age: 30,
      home_club_code: null,
      home_club_name: null,
      padel_rank: 12000,
      tennis_rank: null,
      first_seen_at: "2026-01-01T00:00:00.000Z",
      last_activity_at: "2026-02-01T00:00:00.000Z",
    };
    const plan = planPlaytomicIngest([booking("b2", [{ participant_id: "u9", name: "Hugo Martin", email: "hugo@example.com" }])], [existing], new Map(), { newId });
    expect(plan.contactsToInsert).toHaveLength(0);
    expect(plan.identities).toEqual([{ contact_id: "c-moja", external_id: "u9" }]);
    expect(plan.contactsToUpdate[0].last_activity_at).toBe("2026-11-10T18:00:00Z");
    expect(plan.contactsToUpdate[0].first_seen_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("ignore les réservations annulées et ne double pas un joueur déjà identifié", () => {
    seq = 0;
    const plan = planPlaytomicIngest(
      [
        booking("b3", [{ participant_id: "u1", name: "Lou Bernard", email: null }], { is_canceled: true }),
        booking("b4", [{ participant_id: "u1", name: "Lou Bernard", email: null }]),
        booking("b5", [{ participant_id: "u1", name: "Lou Bernard", email: null }]),
      ],
      [],
      new Map(),
      { newId },
    );
    expect(plan.counts.canceled).toBe(1);
    expect(plan.contactsToInsert).toHaveLength(1);
    expect(plan.conversions).toHaveLength(2);
  });

  it("découpe les noms", () => {
    expect(splitName("  marie  claire durand ")).toEqual({ first: "marie claire", last: "DURAND" });
    expect(splitName("Zoé")).toEqual({ first: "Zoé", last: null });
    expect(splitName(null)).toEqual({ first: null, last: null });
  });
});
