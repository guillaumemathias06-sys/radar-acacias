import { describe, expect, it } from "vitest";
import { ContactIndex, type ContactRecord } from "./merge";

const base: Omit<ContactRecord, "id" | "first_name" | "last_name" | "fft_crm_id"> = {
  email: "famille@example.com", phone: null, gender: null, sporting_age: null, home_club_code: null,
  home_club_name: null, padel_rank: null, tennis_rank: null, first_seen_at: null, last_activity_at: null,
};
const parent: ContactRecord = { ...base, id: "p", first_name: "Anne", last_name: "MARTIN", fft_crm_id: 1 };
const enfant: ContactRecord = { ...base, id: "e", first_name: "Léo", last_name: "MARTIN", fft_crm_id: 2 };

describe("ContactIndex — e-mail familial", () => {
  const index = new ContactIndex([parent, enfant]);

  it("ne rattache jamais un autre licencié FFT par l'e-mail", () => {
    expect(index.find({ fft_crm_id: 3, email: base.email, phone: null, last_name: "MARTIN" })).toBeNull();
  });
  it("sans licence, tranche sur le prénom et le nom", () => {
    expect(index.find({ fft_crm_id: null, email: base.email, phone: null, last_name: "Martin", first_name: "Leo" })?.id).toBe("e");
  });
  it("sans licence et sans nom distinctif, ne devine pas", () => {
    expect(index.find({ fft_crm_id: null, email: base.email, phone: null, last_name: "MARTIN" })).toBeNull();
    expect(index.find({ fft_crm_id: null, email: base.email, phone: null, last_name: "DUPONT", first_name: "Paul" })).toBeNull();
  });
  it("une seule fiche derrière l'adresse : rattachement direct", () => {
    const solo = new ContactIndex([parent]);
    expect(solo.find({ fft_crm_id: null, email: base.email, phone: null, last_name: "X" })?.id).toBe("p");
  });
});
