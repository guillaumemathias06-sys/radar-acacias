import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamMember } from "@/lib/auth";
import { brevo } from "@/lib/brevo/client";
import { EMAIL_TEMPLATES } from "@/emails/templates";

export const maxDuration = 60;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("senders") }),
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
    case "create": {
      const htmlContent = EMAIL_TEMPLATES[b.template];
      if (!htmlContent) return NextResponse.json({ ok: false, error: "Template inconnu." }, { status: 400 });
      return reply(
        await brevo("/emailCampaigns", {
          method: "POST",
          body: { name: b.name, subject: b.subject, previewText: b.previewText, sender: { id: b.senderId }, htmlContent, recipients: { listIds: [b.listId] }, utmCampaign: b.utmCampaign },
        }),
      );
    }
    case "status":
      return reply(await brevo(`/emailCampaigns/${b.campaignId}`));
    case "test":
      return reply(await brevo(`/emailCampaigns/${b.campaignId}/sendTest`, { method: "POST", body: {} }));
    case "send":
      return reply(await brevo(`/emailCampaigns/${b.campaignId}/sendNow`, { method: "POST" }));
  }
}
