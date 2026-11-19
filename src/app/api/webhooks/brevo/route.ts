import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidBearer } from "@/lib/security/bearer";
import { parseBrevoEvents } from "@/lib/brevo/events";
import { brevoWebhookSecret, ingestBrevoEvents } from "@/lib/brevo/webhook";
import { ACACIAS_CLUB_ID } from "@/lib/club";

export const maxDuration = 60;

/**
 * Webhook « marketing » de Brevo : ouvertures, clics, désinscriptions,
 * rebonds, plaintes. Appelé sans session (le proxy le laisse passer) ;
 * authentifié par le secret dérivé, envoyé par Brevo en Bearer.
 */
export async function POST(request: NextRequest) {
  if (!hasValidBearer(request.headers.get("authorization"), brevoWebhookSecret() ?? undefined)) {
    const h = request.headers.get("authorization");
    console.warn(`[brevo-webhook] 401 — en-tête Authorization ${h ? (h.startsWith("Bearer ") ? "Bearer (secret différent)" : "d'un autre type") : "absent"}`);
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const events = parseBrevoEvents(await request.json().catch(() => null));
  try {
    const result = await ingestBrevoEvents(createAdminClient(), ACACIAS_CLUB_ID, events);
    console.log(`[brevo-webhook] ${events.length} événement(s) : ${[...new Set(events.map((e) => e.type))].join(", ") || "aucun reconnu"} — ${result.recorded} enregistré(s), ${result.unknownEmails} e-mail(s) inconnu(s)`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // 500 : Brevo réessaie plus tard, rien n'est perdu.
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
