import { describe, expect, it } from "vitest";
import { parseBrevoEvents } from "./events";

describe("parseBrevoEvents", () => {
  it("normalise les noms d'événements et les champs Brevo", () => {
    const events = parseBrevoEvents([
      { event: "opened", email: "A@X.fr", camp_id: 35, ts_event: 1795066033 },
      { event: "click", email: "b@x.fr", camp_id: "35", URL: "https://tenup.fft.fr/tournoi/325629", date_event: "2026-11-19 08:40:00" },
      { event: "hard_bounce", email: "c@x.fr", camp_id: 35 },
      { event: "unsubscribe", email: "d@x.fr", camp_id: 35 },
      { event: "list_addition", email: "e@x.fr" },
      { event: "spam" },
    ]);
    expect(events.map((e) => [e.type, e.email, e.brevoCampaignId])).toEqual([
      ["opened", "a@x.fr", 35],
      ["clicked", "b@x.fr", 35],
      ["bounced", "c@x.fr", 35],
      ["unsubscribed", "d@x.fr", 35],
    ]);
    expect(events[0].occurredAt).toBe(new Date(1795066033 * 1000).toISOString());
    expect(events[1].url).toContain("tenup");
  });

  it("accepte un événement seul et ignore le reste", () => {
    expect(parseBrevoEvents({ event: "delivered", email: "a@x.fr", camp_id: 1 })).toHaveLength(1);
    expect(parseBrevoEvents(null)).toEqual([]);
    expect(parseBrevoEvents("x")).toEqual([]);
  });
});
