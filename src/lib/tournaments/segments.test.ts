import { describe, expect, it } from "vitest";
import { eventSegment, normalizePadelCategory, tennisSegment } from "./segments";
import { comparableKey } from "./fill";

describe("segments padel", () => {
  it("normalise toute l'échelle P25 → P2000", () => {
    for (const p of ["P25", "p50", "P 100", "250", "P500", "P1000", "P2000"]) expect(normalizePadelCategory(p)).toMatch(/^P(25|50|100|250|500|1000|2000)$/);
    expect(normalizePadelCategory("P 1000")).toBe("P1000");
    expect(normalizePadelCategory(null)).toBeNull();
  });
});

describe("segments tennis", () => {
  it("rattache la plage de classements aux séries FFT", () => {
    expect(tennisSegment("30/4", "30/1")).toBe("4e série (30/4 → 30/1)");
    expect(tennisSegment("15/5", "15/2")).toBe("3e série (15/5 → 15/2)");
    expect(tennisSegment("30/3", "30")).toBe("4e → 3e série (30/3 → 30)");
    expect(tennisSegment("NC", "N1")).toBe("Open (NC → N1)");
  });
  it("ajoute la catégorie d'âge hors seniors", () => {
    expect(eventSegment({ padelCategory: null, nature: "SM", ageCategory: "13/14 ans", rankMin: "30/3", rankMax: "30" }).segment).toBe("4e → 3e série (30/3 → 30) · 13/14 ans");
    expect(eventSegment({ padelCategory: "P100", nature: "DM", ageCategory: "Senior" })).toEqual({ discipline: "padel", segment: "P100" });
  });
  it("un TMC 4e série ne se compare pas à un Open", () => {
    const base = { nature: "SM", ageCategory: "Senior", padelCategory: null };
    expect(comparableKey({ ...base, rankMin: "30/4", rankMax: "30/1" })).not.toBe(comparableKey({ ...base, rankMin: "NC", rankMax: "N1" }));
  });
});
