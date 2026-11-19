import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { emailsFromCsv } from "./pull";

describe("emailsFromCsv", () => {
  it("lit la colonne e-mail, quel que soit le séparateur", () => {
    expect(emailsFromCsv('﻿"EMAIL";"NOM"\n"A@x.fr";"A"\n"b@x.fr";"B"\n"a@x.fr";"A"\n')).toEqual(["a@x.fr", "b@x.fr"]);
    expect(emailsFromCsv("id,email,date\n1,c@x.fr,2026\n")).toEqual(["c@x.fr"]);
    expect(emailsFromCsv("")).toEqual([]);
  });
});
