import { describe, expect, it } from "vitest";
import { assessUpcoming, type FillEvent } from "./fill";

const base = { nature: "DM", ageCategory: "Senior", padelCategory: "P100", tournamentLabel: "P100 HOMMES" };
const ev = (id: string, startsOn: string, registeredCount: number, extra: Partial<FillEvent> = {}): FillEvent => ({ id, label: "DM", startsOn, registeredCount, ...base, ...extra });

describe("assessUpcoming", () => {
  const past = [ev("p1", "2026-10-11", 22), ev("p2", "2026-10-25", 26)]; // référence P100 = 24

  it("0 inscrit à J-33 : à surveiller ; à 3 semaines : critique", () => {
    const today = "2026-11-17";
    const [s] = assessUpcoming([...past, ev("u1", "2026-12-20", 0)], today);
    expect(s.level).toBe("warning");
    const [s2] = assessUpcoming([...past, ev("u1", "2026-12-06", 0)], today);
    expect(s2.level).toBe("critical");
    expect(s2.reason).toBe("0 inscrit à J-19");
  });

  it("compare au rythme attendu de la référence", () => {
    const today = "2026-11-17";
    // J-5 : attendu 60 % de 24 ≈ 14
    expect(assessUpcoming([...past, ev("u", "2026-11-22", 13)], today)[0].level).toBe("ok");
    expect(assessUpcoming([...past, ev("u", "2026-11-22", 9)], today)[0].level).toBe("warning");
    expect(assessUpcoming([...past, ev("u", "2026-11-22", 5)], today)[0].level).toBe("critical");
  });

  it("n'invente pas de référence avec un seul tournoi comparable", () => {
    const [s] = assessUpcoming([ev("p1", "2026-10-11", 22), ev("u", "2026-12-13", 3)], "2026-11-17");
    expect(s.level).toBe("unknown");
    expect(s.reference).toBeNull();
  });

  it("trie les alertes critiques en premier", () => {
    const out = assessUpcoming([...past, ev("ok", "2026-11-22", 20), ev("bad", "2026-11-29", 0)], "2026-11-17");
    expect(out.map((s) => s.event.id)).toEqual(["bad", "ok"]);
  });
});
