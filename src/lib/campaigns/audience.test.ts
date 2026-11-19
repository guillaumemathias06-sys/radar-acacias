import { describe, expect, it } from "vitest";
import { buildAudience, type AudienceContact, type PastRegistration } from "./audience";

const c = (id: string, email: string | null, gender: string | null = "M"): AudienceContact => ({ id, email, first_name: id, last_name: null, gender });
const r = (contactId: string, eventId: string, padelCategory: string | null, nature = "DM"): PastRegistration => ({ contactId, eventId, nature, padelCategory });
const target = { eventId: "T", nature: "DM", padelCategory: "P50" };
const none = { deniedContactIds: new Set<string>(), suppressedEmails: new Set<string>() };

describe("buildAudience", () => {
  it("garde les niveaux proches et exclut les inscrits", () => {
    const contacts = [c("a", "a@x.fr"), c("b", "b@x.fr"), c("d", "d@x.fr"), c("e", "e@x.fr")];
    const regs = [r("a", "1", "P25"), r("b", "2", "P500"), r("d", "3", "P100"), r("d", "T", "P50"), r("e", "4", "P50")];
    const { members, counts } = buildAudience(target, regs, contacts, { scope: "proche", ...none });
    expect(members.map((m) => m.email)).toEqual(["a@x.fr", "e@x.fr"]);
    expect(counts.deja_inscrits).toBe(1);
    expect(buildAudience(target, regs, contacts, { scope: "tout", ...none }).members).toHaveLength(3);
    // « inferieur » : P25 et P50 seulement, pas le P100 de d (déjà inscrit de toute façon) ni le P500 de b.
    expect(buildAudience(target, [...regs, r("b", "5", "P100")], contacts, { scope: "inferieur", ...none }).members.map((m) => m.email)).toEqual(["a@x.fr", "e@x.fr"]);
  });

  it("respecte la nature, le genre en mixte, les refus et désinscriptions", () => {
    const contacts = [c("a", "a@x.fr"), c("f", "f@x.fr", "F"), c("m", "m@x.fr"), c("n", "n@x.fr"), c("s", "s@x.fr")];
    const regs = [r("a", "1", "P50", "DD"), r("f", "2", "P50", "DX"), r("m", "3", "P50", "DX"), r("n", "4", "P50"), r("s", "5", "P50")];
    const { members, counts } = buildAudience(target, regs, contacts, { scope: "proche", deniedContactIds: new Set(["n"]), suppressedEmails: new Set(["s@x.fr"]) });
    expect(members.map((m) => m.email)).toEqual(["m@x.fr"]);
    expect(counts.refus).toBe(1);
    expect(counts.desinscrits).toBe(1);
  });

  it("dédoublonne les e-mails de famille et écarte le foyer d'un inscrit", () => {
    const contacts = [c("p", "fam@x.fr"), c("q", "fam@x.fr"), c("u", "u@x.fr"), c("v", "u@x.fr")];
    const regs = [r("p", "1", "P50"), r("q", "2", "P25"), r("u", "3", "P50"), r("v", "T", "P50")];
    const { members } = buildAudience(target, regs, contacts, { scope: "proche", ...none });
    expect(members).toEqual([{ email: "fam@x.fr", firstName: "p", lastName: null, contactIds: ["p", "q"] }]);
  });
});
