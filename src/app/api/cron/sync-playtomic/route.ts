import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidBearer } from "@/lib/security/bearer";
import { syncPlaytomic } from "@/lib/playtomic/sync";
import { ACACIAS_CLUB_ID } from "@/lib/club";
import { pullCampaignDetail } from "@/lib/brevo/pull";
import { brevoConfigured } from "@/lib/brevo/client";

export const maxDuration = 300;

/** Cron Vercel quotidien (vercel.json) : les 3 derniers jours, pour rattraper un éventuel raté. */
export async function GET(request: NextRequest) {
  if (!hasValidBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const db = createAdminClient();
  const result = await syncPlaytomic(db, ACACIAS_CLUB_ID, 3);
  // Détail des campagnes Brevo envoyées ces 14 derniers jours (complète le webhook).
  const brevoErrors: string[] = [];
  if (brevoConfigured()) {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data: recent } = await db.from("campaigns").select("brevo_campaign_id").eq("club_id", ACACIAS_CLUB_ID).not("brevo_campaign_id", "is", null).gte("sent_at", since);
    for (const c of recent ?? []) {
      try {
        brevoErrors.push(...(await pullCampaignDetail(db, ACACIAS_CLUB_ID, c.brevo_campaign_id)).errors);
      } catch (err) {
        brevoErrors.push(err instanceof Error ? err.message : "Erreur Brevo");
      }
    }
  }
  return NextResponse.json({ ...result, brevoErrors }, { status: result.ok ? 200 : 500 });
}
