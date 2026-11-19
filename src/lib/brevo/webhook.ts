import "server-only";
import crypto from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { chunk } from "@/lib/supabase/batch";
import type { BrevoWebhookEvent } from "./events";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Secret du webhook Brevo, dérivé de SECRETS_ENCRYPTION_KEY (déjà sur
 * Vercel) : aucune nouvelle variable à créer, et il change si la clé change.
 */
export function brevoWebhookSecret(): string | null {
  const key = process.env.SECRETS_ENCRYPTION_KEY;
  return key ? crypto.createHmac("sha256", key).update("brevo-webhook-v1").digest("hex") : null;
}

/**
 * Enregistre les événements : un touchpoint par contact (un e-mail de
 * famille = plusieurs fiches), ouvreurs / cliqueurs uniques par campagne.
 * Désinscription ou plainte spam → suppression + consentement refusé,
 * prioritaires sur tout le reste.
 */
export async function ingestBrevoEvents(db: AdminClient, clubId: string, events: BrevoWebhookEvent[]): Promise<{ recorded: number; unknownEmails: number; suppressions: number }> {
  if (!events.length) return { recorded: 0, unknownEmails: 0, suppressions: 0 };
  const emails = [...new Set(events.map((e) => e.email))];
  const contactsByEmail = new Map<string, string[]>();
  for (const part of chunk(emails, 200)) {
    const { data, error } = await db.from("contacts").select("id, email").eq("club_id", clubId).in("email", part);
    if (error) throw new Error(`Lecture des contacts : ${error.message}`);
    for (const c of data ?? []) contactsByEmail.set(c.email, [...(contactsByEmail.get(c.email) ?? []), c.id]);
  }
  const campIds = [...new Set(events.map((e) => e.brevoCampaignId).filter((id): id is number => id !== null))];
  const campaigns = new Map<number, { id: string; channel_id: string }>();
  if (campIds.length) {
    const { data, error } = await db.from("campaigns").select("id, channel_id, brevo_campaign_id").eq("club_id", clubId).in("brevo_campaign_id", campIds);
    if (error) throw new Error(`Lecture des campagnes : ${error.message}`);
    for (const c of data ?? []) campaigns.set(c.brevo_campaign_id, { id: c.id, channel_id: c.channel_id });
  }

  let unknownEmails = 0;
  const rows: { contact_id: string; campaign_id: string | null; channel_id: string | null; type: string; occurred_at: string; meta: Record<string, unknown> }[] = [];
  for (const e of events) {
    const ids = contactsByEmail.get(e.email);
    if (!ids) { unknownEmails++; continue; }
    const camp = e.brevoCampaignId !== null ? campaigns.get(e.brevoCampaignId) : undefined;
    for (const contact_id of ids) {
      rows.push({ contact_id, campaign_id: camp?.id ?? null, channel_id: camp?.channel_id ?? null, type: e.type, occurred_at: e.occurredAt, meta: { source: "brevo", brevo_campaign_id: e.brevoCampaignId, event: e.rawEvent, ...(e.url ? { url: e.url } : {}) } });
    }
  }
  // Doublons dans un même lot (index unique partiel : on dédoublonne ici).
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    if (!r.campaign_id) return true;
    const k = `${r.campaign_id}|${r.contact_id}|${r.type}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const withCampaign = unique.filter((r) => r.campaign_id);
  const withoutCampaign = unique.filter((r) => !r.campaign_id);
  for (const part of chunk(withCampaign)) {
    const { error } = await db.from("touchpoints").upsert(part, { onConflict: "campaign_id,contact_id,type", ignoreDuplicates: true });
    if (error) throw new Error(`Touchpoints : ${error.message}`);
  }
  for (const part of chunk(withoutCampaign)) {
    const { error } = await db.from("touchpoints").insert(part);
    if (error) throw new Error(`Touchpoints : ${error.message}`);
  }

  // Désinscriptions et plaintes : jamais plus d'e-mail à ces adresses.
  const optOuts = [...new Set(events.filter((e) => e.type === "unsubscribed" || e.type === "spam").map((e) => e.email))];
  if (optOuts.length) {
    const { data: existing } = await db.from("suppressions").select("email").eq("club_id", clubId).in("email", optOuts).in("channel", ["email", "all"]);
    const already = new Set((existing ?? []).map((s) => s.email));
    const fresh = optOuts.filter((e) => !already.has(e));
    if (fresh.length) {
      const { error } = await db.from("suppressions").insert(fresh.map((email) => ({ club_id: clubId, email, channel: "email", reason: "Brevo : désinscription ou plainte" })));
      if (error) throw new Error(`Désinscriptions : ${error.message}`);
    }
    const ids = optOuts.flatMap((e) => contactsByEmail.get(e) ?? []);
    if (ids.length) {
      const { error } = await db.from("consents").upsert(ids.map((contact_id) => ({ contact_id, channel: "email", status: "denied", source: "brevo", recorded_at: new Date().toISOString() })), { onConflict: "contact_id,channel" });
      if (error) throw new Error(`Consentements : ${error.message}`);
    }
  }
  return { recorded: unique.length, unknownEmails, suppressions: optOuts.length };
}
