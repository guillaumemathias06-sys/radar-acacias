import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamMember } from "@/lib/auth";
import { brevo } from "@/lib/brevo/client";
import { EMAIL_TEMPLATES } from "@/emails/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { brevoWebhookSecret } from "@/lib/brevo/webhook";
import { ACACIAS_CLUB_ID } from "@/lib/club";

const WEBHOOK_URL = "https://radar-acacias.vercel.app/api/webhooks/brevo";
const WEBHOOK_EVENTS = ["delivered", "opened", "click", "unsubscribed", "hardBounce", "softBounce", "spam"];

export const maxDuration = 60;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("senders") }),
  z.object({ action: z.literal("webhook") }),
  z.object({
    action: z.literal("create"),
    template: z.string(),
    listId: z.number().int().positive(),
    name: z.string().min(1),
    subject: z.string().min(1),
    previewText: z.string().optional(),
    senderId: z.number().int().positive(),
    utmCampaign: z.string().optional(),
  }),
  z.object({ action: z.literal("status"), campaignId: z.number().int().positive() }),
  // Test : envoyé à la liste de test configurée dans Brevo (aucune adresse ne transite par Radar).
  z.object({ action: z.literal("test"), campaignId: z.number().int().positive() }),
  z.object({ action: z.literal("send"), campaignId: z.number().int().positive() }),
]);

/** Campagnes Brevo : brouillon, test, envoi. Chaque envoi est un geste explicite. */
export async function POST(req: Request) {
  if (!(await requireTeamMember())) return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 });
  const b = parsed.data;

  const reply = (r: { data: unknown; error: string | null }) => NextResponse.json(r.error ? { ok: false, error: r.error } : { ok: true, data: r.data ?? null }, { status: r.error ? 502 : 200 });

  switch (b.action) {
    case "senders":
      return reply(await brevo("/senders"));
    case "webhook": {
      // Idempotent : ne crée le webhook que s'il n'existe pas déjà.
      const secret = brevoWebhookSecret();
      if (!secret) return NextResponse.json({ ok: false, error: "SECRETS_ENCRYPTION_KEY absente." }, { status: 500 });
      const list = await brevo<{ webhooks?: { id: number; url: string }[] }>("/webhooks?type=marketing");
      // Brevo répond 400 « Webhook record does not exist » quand il n'y en a aucun.
      if (list.error && !/does not exist/i.test(list.error)) return reply(list);
      const existing = list.data?.webhooks?.find((w) => w.url === WEBHOOK_URL);
      if (existing) return NextResponse.json({ ok: true, data: { id: existing.id, existing: true } });
      return reply(
        await brevo("/webhooks", {
          method: "POST",
          body: { url: WEBHOOK_URL, description: "Radar — retours des campagnes", events: WEBHOOK_EVENTS, type: "marketing", auth: { type: "bearer", token: secret } },
        }),
      );
    }
    case "create": {
      const htmlContent = EMAIL_TEMPLATES[b.template];
      if (!htmlContent) return NextResponse.json({ ok: false, error: "Template inconnu." }, { status: 400 });
      const created = await brevo<{ id: number }>("/emailCampaigns", {
        method: "POST",
        body: { name: b.name, subject: b.subject, previewText: b.previewText, sender: { id: b.senderId }, htmlContent, recipients: { listIds: [b.listId] }, utmCampaign: b.utmCampaign },
      });
      if (created.data?.id) {
        await createAdminClient().from("campaigns").update({ brevo_campaign_id: created.data.id }).eq("club_id", ACACIAS_CLUB_ID).eq("brevo_list_id", b.listId).is("brevo_campaign_id", null);
      }
      return reply(created);
    }
    case "status":
      return reply(await brevo(`/emailCampaigns/${b.campaignId}`));
    case "test":
      return reply(await brevo(`/emailCampaigns/${b.campaignId}/sendTest`, { method: "POST", body: {} }));
    case "send": {
      const sent = await brevo(`/emailCampaigns/${b.campaignId}/sendNow`, { method: "POST" });
      if (!sent.error) await createAdminClient().from("campaigns").update({ status: "active", sent_at: new Date().toISOString() }).eq("brevo_campaign_id", b.campaignId);
      return reply(sent);
    }
  }
}
