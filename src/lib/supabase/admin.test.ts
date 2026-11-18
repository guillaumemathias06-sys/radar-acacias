import { describe, expect, it } from "vitest";
import { describeServiceKey } from "./admin";

const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.sig`;

describe("describeServiceKey", () => {
  it("reconnaît les clés secrètes, nouvelles et anciennes", () => {
    expect(describeServiceKey("sb_secret_abc")).toBe("secret");
    expect(describeServiceKey(jwt("service_role"))).toBe("secret");
  });
  it("refuse les clés publiques collées par erreur", () => {
    expect(describeServiceKey("sb_publishable_abc")).toMatch(/^publishable/);
    expect(describeServiceKey(jwt("anon"))).toMatch(/^jwt:anon/);
    expect(describeServiceKey("")).toBe("absente");
  });
});
