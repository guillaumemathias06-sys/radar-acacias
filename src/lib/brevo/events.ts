/**
 * Événements du webhook « marketing » de Brevo → touchpoints Radar.
 * Logique pure, testée. Brevo envoie un objet par événement (ou un tableau
 * en mode groupé), avec des noms d'événement qui varient selon les versions
 * (« click » / « clicked », « hard_bounce » / « hardBounce »…) : on normalise.
 */
export type EmailEventType = "delivered" | "opened" | "clicked" | "unsubscribed" | "bounced" | "spam";

const EVENT_MAP: Record<string, EmailEventType> = {
  delivered: "delivered",
  opened: "opened",
  open: "opened",
  uniqueopened: "opened",
  proxyopen: "opened",
  click: "clicked",
  clicked: "clicked",
  unsubscribe: "unsubscribed",
  unsubscribed: "unsubscribed",
  hardbounce: "bounced",
  softbounce: "bounced",
  spam: "spam",
  complaint: "spam",
};

export interface BrevoWebhookEvent {
  type: EmailEventType;
  email: string;
  brevoCampaignId: number | null;
  occurredAt: string;
  url: string | null;
  rawEvent: string;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
}

export function parseBrevoEvents(body: unknown): BrevoWebhookEvent[] {
  const items = Array.isArray(body) ? body : body && typeof body === "object" ? [body] : [];
  const out: BrevoWebhookEvent[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const rawEvent = str(o.event) ?? "";
    const type = EVENT_MAP[rawEvent.toLowerCase().replace(/[^a-z]/g, "")];
    const email = str(o.email)?.toLowerCase();
    if (!type || !email) continue;
    const camp = Number(str(o.camp_id) ?? str(o.campaign_id));
    const ts = Number(o.ts_event ?? o.ts);
    const dateEvent = str(o.date_event) ?? str(o.date);
    const occurredAt = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : dateEvent && !Number.isNaN(Date.parse(dateEvent)) ? new Date(dateEvent).toISOString() : new Date().toISOString();
    out.push({ type, email, brevoCampaignId: Number.isFinite(camp) && camp > 0 ? camp : null, occurredAt, url: str(o.URL) ?? str(o.url) ?? str(o.link), rawEvent });
  }
  return out;
}
