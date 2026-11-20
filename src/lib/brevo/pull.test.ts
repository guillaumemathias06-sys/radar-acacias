import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { emailsFromCsv, exportsToRun } from "./pull";

describe("emailsFromCsv", () => {
  it("lit la colonne e-mail, quel que soit le séparateur", () => {
    expect(emailsFromCsv('﻿"EMAIL";"NOM"\n"A@x.fr";"A"\n"b@x.fr";"B"\n"a@x.fr";"A"\n')).toEqual(["a@x.fr", "b@x.fr"]);
    expect(emailsFromCsv("id,email,date\n1,c@x.fr,2026\n")).toEqual(["c@x.fr"]);
    expect(emailsFromCsv("")).toEqual([]);
  });
});

describe("exportsToRun", () => {
  const types = (r: [string, string][]) => r.map(([t]) => t);
  it("n'exporte que les types où Brevo compte plus que Radar", () => {
    expect(types(exportsToRun({ uniqueViews: 22, uniqueClicks: 0, unsubscriptions: 0, hardBounces: 1 }, { opened: 14, bounced: 1 }))).toEqual(["openers"]);
    expect(types(exportsToRun({ uniqueViews: 14, uniqueClicks: 2, unsubscriptions: 1, hardBounces: 0 }, { opened: 14 }))).toEqual(["clickers", "unsubscribed"]);
  });
  it("rien à exporter quand tout est à jour", () => {
    expect(exportsToRun({ uniqueViews: 5 }, { opened: 5 })).toEqual([]);
  });
  it("sans statistiques, exporte tout", () => {
    expect(exportsToRun(null, {})).toHaveLength(4);
  });
});
